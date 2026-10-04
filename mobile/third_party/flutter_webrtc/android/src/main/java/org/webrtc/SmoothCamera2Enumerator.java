package org.webrtc;

import android.content.Context;

/** Camera2Enumerator that creates SmoothCamera2Capturer instances. */
public class SmoothCamera2Enumerator extends Camera2Enumerator {
  private final Context context;

  public SmoothCamera2Enumerator(Context context) {
    super(context);
    this.context = context;
  }

  @Override
  public CameraVideoCapturer createCapturer(
      String deviceName, CameraVideoCapturer.CameraEventsHandler eventsHandler) {
    return new SmoothCamera2Capturer(context, deviceName, eventsHandler);
  }
}
