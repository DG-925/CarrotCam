package org.webrtc;

import android.content.Context;
import android.hardware.camera2.CameraManager;

/** Camera2Capturer that keeps a steady frame rate (see SmoothCamera2Session). */
public class SmoothCamera2Capturer extends Camera2Capturer {
  private final CameraManager manager;

  public SmoothCamera2Capturer(Context context, String cameraName, CameraEventsHandler eventsHandler) {
    super(context, cameraName, eventsHandler);
    manager = (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);
  }

  @Override
  protected void createCameraSession(CameraSession.CreateSessionCallback createSessionCallback,
      CameraSession.Events events, Context applicationContext,
      SurfaceTextureHelper surfaceTextureHelper, String cameraName, int width, int height,
      int framerate) {
    SmoothCamera2Session.create(createSessionCallback, events, applicationContext, manager,
        surfaceTextureHelper, cameraName, width, height, framerate);
  }
}
