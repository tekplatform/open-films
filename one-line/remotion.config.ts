import {Config} from "@remotion/cli/config";

Config.setEntryPoint("./src/index.tsx");
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setPixelFormat("yuv420p");
Config.setCodec("h264");
Config.setCrf(16);
Config.setChromiumOpenGlRenderer("angle");
