// CarrotCam virtual camera (DirectShow source filter).
//
// Based on softcam by tshino (MIT License, see LICENSE-softcam).
// Changes for CarrotCam:
//  - own filter name / CLSID / shared memory names so it never collides
//    with other softcam based products
//  - per-user registration through `regsvr32 /n /i:user` (no admin needed)
//  - placeholder image while the CarrotCam app is not running

#include "softcam.h"

#include <olectl.h>
#include <initguid.h>
#include <string>

#include <softcamcore/DShowSoftcam.h>
#include <softcamcore/SenderAPI.h>


// {73EEB1BE-1807-4FBB-AB20-AA1364E1A8D2}
DEFINE_GUID(CLSID_CarrotCam,
0x73eeb1be, 0x1807, 0x4fbb, 0xab, 0x20, 0xaa, 0x13, 0x64, 0xe1, 0xa8, 0xd2);


namespace {

const wchar_t FILTER_NAME[] = L"CarrotCam";
const wchar_t FILTER_CLSID_STR[] = L"{73EEB1BE-1807-4FBB-AB20-AA1364E1A8D2}";
const wchar_t VIDEO_INPUT_CATEGORY_STR[] = L"{860BB310-5D01-11d0-BD3B-00A0C911CE86}";
const GUID &FILTER_CLASSID = CLSID_CarrotCam;

HMODULE g_module = nullptr;

const AMOVIESETUP_MEDIATYPE s_pin_types[] =
{
    {
        &MEDIATYPE_Video,       // Major type
        &MEDIASUBTYPE_NULL      // Minor type
    }
};

const AMOVIESETUP_PIN s_pins[] =
{
    {
        const_cast<LPWSTR>(L"Output"),  // Pin string name
        FALSE,                  // Is it rendered
        TRUE,                   // Is it an output
        FALSE,                  // Can we have none
        FALSE,                  // Can we have many
        &CLSID_NULL,            // Connects to filter
        NULL,                   // Connects to pin
        1,                      // Number of types
        s_pin_types             // Pin details
    }
};

const REGFILTER2 s_reg_filter2 =
{
    1,
    MERIT_DO_NOT_USE,
    1,
    s_pins
};

CUnknown * WINAPI CreateCarrotCamInstance(LPUNKNOWN lpunk, HRESULT *phr)
{
    return softcam::Softcam::CreateInstance(lpunk, FILTER_CLASSID, phr);
}

std::wstring ModulePath()
{
    wchar_t path[MAX_PATH * 2] = {};
    GetModuleFileNameW(g_module, path, (DWORD)(sizeof(path) / sizeof(path[0])));
    return path;
}

LSTATUS SetStringValue(HKEY key, const wchar_t* name, const std::wstring& value)
{
    return RegSetValueExW(key, name, 0, REG_SZ,
        reinterpret_cast<const BYTE*>(value.c_str()),
        (DWORD)((value.size() + 1) * sizeof(wchar_t)));
}

// Writes CLSID\{...}\InprocServer32 under the given classes root.
HRESULT WriteServerKeys(HKEY classes_root)
{
    std::wstring clsid_key = std::wstring(L"CLSID\\") + FILTER_CLSID_STR;
    HKEY key = nullptr;
    if (RegCreateKeyExW(classes_root, clsid_key.c_str(), 0, nullptr, 0,
            KEY_WRITE, nullptr, &key, nullptr) != ERROR_SUCCESS)
    {
        return SELFREG_E_CLASS;
    }
    SetStringValue(key, nullptr, FILTER_NAME);
    HKEY inproc = nullptr;
    LSTATUS st = RegCreateKeyExW(key, L"InprocServer32", 0, nullptr, 0,
            KEY_WRITE, nullptr, &inproc, nullptr);
    RegCloseKey(key);
    if (st != ERROR_SUCCESS)
    {
        return SELFREG_E_CLASS;
    }
    SetStringValue(inproc, nullptr, ModulePath());
    SetStringValue(inproc, L"ThreadingModel", L"Both");
    RegCloseKey(inproc);
    return S_OK;
}

// The filter mapper names the category instance after FILTER_NAME.
std::wstring InstanceKey(const wchar_t* instance = FILTER_NAME)
{
    return std::wstring(L"CLSID\\") + VIDEO_INPUT_CATEGORY_STR + L"\\Instance\\" + instance;
}

HRESULT DeleteServerKeys(HKEY classes_root)
{
    std::wstring clsid_key = std::wstring(L"CLSID\\") + FILTER_CLSID_STR;
    RegDeleteTreeW(classes_root, clsid_key.c_str());
    RegDeleteTreeW(classes_root, InstanceKey().c_str());
    RegDeleteTreeW(classes_root, InstanceKey(FILTER_CLSID_STR).c_str()); // early builds
    return S_OK;
}

// Fallback for the per-user registration if the filter mapper refuses to
// work against the redirected classes root: enough for the system device
// enumerator to list and instantiate the camera.
HRESULT WriteCategoryKeysManually(HKEY classes_root)
{
    HKEY key = nullptr;
    if (RegCreateKeyExW(classes_root, InstanceKey().c_str(), 0, nullptr, 0,
            KEY_WRITE, nullptr, &key, nullptr) != ERROR_SUCCESS)
    {
        return SELFREG_E_CLASS;
    }
    SetStringValue(key, L"FriendlyName", FILTER_NAME);
    SetStringValue(key, L"CLSID", FILTER_CLSID_STR);
    RegCloseKey(key);
    return S_OK;
}

HRESULT RegisterCategory(IFilterMapper2* fm2)
{
    fm2->UnregisterFilter(&CLSID_VideoInputDeviceCategory, 0, FILTER_CLASSID);
    return fm2->RegisterFilter(
            FILTER_CLASSID,
            FILTER_NAME,
            0,
            &CLSID_VideoInputDeviceCategory,
            FILTER_NAME,
            &s_reg_filter2);
}

// Per-user (no admin) registration. HKCR is redirected to HKCU\Software\Classes
// while the keys are written, which is the view every unelevated app sees.
HRESULT RegisterPerUser(bool install)
{
    HKEY user_classes = nullptr;
    if (RegCreateKeyExW(HKEY_CURRENT_USER, L"Software\\Classes", 0, nullptr, 0,
            KEY_ALL_ACCESS, nullptr, &user_classes, nullptr) != ERROR_SUCCESS)
    {
        return E_ACCESSDENIED;
    }
    if (!install)
    {
        DeleteServerKeys(user_classes);
        RegCloseKey(user_classes);
        return S_OK;
    }

    DeleteServerKeys(user_classes);
    HRESULT hr = WriteServerKeys(user_classes);
    if (SUCCEEDED(hr))
    {
        HRESULT co = CoInitialize(nullptr);
        IFilterMapper2 *fm2 = nullptr;
        // Create the mapper before redirecting HKCR so COM can still find it.
        HRESULT mapper_hr = CoCreateInstance(
                CLSID_FilterMapper2, nullptr, CLSCTX_INPROC_SERVER,
                IID_IFilterMapper2, (void**)&fm2);
        bool registered = false;
        if (SUCCEEDED(mapper_hr))
        {
            if (RegOverridePredefKey(HKEY_CLASSES_ROOT, user_classes) == ERROR_SUCCESS)
            {
                registered = SUCCEEDED(RegisterCategory(fm2));
                RegOverridePredefKey(HKEY_CLASSES_ROOT, nullptr);
            }
            fm2->Release();
        }
        // Make sure the instance key really landed in the per-user hive.
        HKEY probe = nullptr;
        if (registered && RegOpenKeyExW(user_classes, InstanceKey().c_str(), 0,
                KEY_READ, &probe) == ERROR_SUCCESS)
        {
            RegCloseKey(probe);
        }
        else
        {
            hr = WriteCategoryKeysManually(user_classes);
        }
        CoFreeUnusedLibraries();
        if (SUCCEEDED(co))
        {
            CoUninitialize();
        }
    }
    RegCloseKey(user_classes);
    return hr;
}

} // namespace

// COM global table of objects in this dll

CFactoryTemplate g_Templates[] =
{
    {
        FILTER_NAME,
        &FILTER_CLASSID,
        &CreateCarrotCamInstance,
        NULL,
        nullptr
    }
};
int g_cTemplates = sizeof(g_Templates) / sizeof(g_Templates[0]);


// Machine wide registration (regsvr32 from an elevated prompt).
STDAPI DllRegisterServer()
{
    HRESULT hr = AMovieDllRegisterServer2(TRUE);
    if (FAILED(hr))
    {
        return hr;
    }
    hr = CoInitialize(nullptr);
    if (FAILED(hr))
    {
        return hr;
    }
    do
    {
        IFilterMapper2 *pFM2 = nullptr;
        hr = CoCreateInstance(
                CLSID_FilterMapper2, nullptr, CLSCTX_INPROC_SERVER,
                IID_IFilterMapper2, (void**)&pFM2);
        if (FAILED(hr))
        {
            break;
        }
        hr = RegisterCategory(pFM2);
        pFM2->Release();
    } while (0);
    CoFreeUnusedLibraries();
    CoUninitialize();
    return hr;
}

STDAPI DllUnregisterServer()
{
    HRESULT hr = AMovieDllRegisterServer2(FALSE);
    if (FAILED(hr))
    {
        return hr;
    }
    hr = CoInitialize(nullptr);
    if (FAILED(hr))
    {
        return hr;
    }
    do
    {
        IFilterMapper2 *pFM2 = nullptr;
        hr = CoCreateInstance(
                CLSID_FilterMapper2, nullptr, CLSCTX_INPROC_SERVER,
                IID_IFilterMapper2, (void**)&pFM2);
        if (FAILED(hr))
        {
            break;
        }
        hr = pFM2->UnregisterFilter(
                &CLSID_VideoInputDeviceCategory,
                FILTER_NAME,
                FILTER_CLASSID);
        pFM2->Release();
    } while (0);
    CoFreeUnusedLibraries();
    CoUninitialize();
    return hr;
}

// `regsvr32 /n /i:user CarrotCamVCam.dll`    -> per-user install (no admin)
// `regsvr32 /u /n /i:user CarrotCamVCam.dll` -> per-user uninstall
STDAPI DllInstall(BOOL bInstall, LPCWSTR pszCmdLine)
{
    if (pszCmdLine && _wcsicmp(pszCmdLine, L"user") == 0)
    {
        return RegisterPerUser(bInstall ? true : false);
    }
    return bInstall ? DllRegisterServer() : DllUnregisterServer();
}

extern "C" BOOL WINAPI DllEntryPoint(HINSTANCE, ULONG, LPVOID);

BOOL APIENTRY DllMain(HANDLE hModule, DWORD  dwReason, LPVOID lpReserved)
{
    if (dwReason == DLL_PROCESS_ATTACH)
    {
        g_module = (HMODULE)hModule;
    }
    return DllEntryPoint((HINSTANCE)(hModule), dwReason, lpReserved);
}


//
// Sender API (used by the CarrotCam desktop app)
//

extern "C" scCamera scCreateCamera(int width, int height, float framerate)
{
    return softcam::sender::CreateCamera(width, height, framerate);
}

extern "C" void     scDeleteCamera(scCamera camera)
{
    return softcam::sender::DeleteCamera(camera);
}

extern "C" void     scSendFrame(scCamera camera, const void* image_bits)
{
    return softcam::sender::SendFrame(camera, image_bits);
}

extern "C" bool     scWaitForConnection(scCamera camera, float timeout)
{
    return softcam::sender::WaitForConnection(camera, timeout);
}

extern "C" bool     scIsConnected(scCamera camera)
{
    return softcam::sender::IsConnected(camera);
}
