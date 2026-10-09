// Kareleri (JPEG) + WAV müziği H.264/AAC MP4'e çevirir (macOS AVFoundation; ffmpeg gerekmez).
// Kullanım: swiftc -O -swift-version 5 promo/encode.swift -o encode && ./encode <kare klasörü> <müzik.wav> <çıktı.mp4> [fps] [bit hızı, varsayılan 8000000]
import AVFoundation
import CoreGraphics
import Foundation
import ImageIO

let args = CommandLine.arguments
guard args.count >= 4 else {
  print("Kullanım: encode <kare klasörü> <müzik.wav> <çıktı.mp4> [fps] [bit hızı]")
  exit(1)
}
let framesDir = URL(fileURLWithPath: args[1])
let wavURL = URL(fileURLWithPath: args[2])
let outURL = URL(fileURLWithPath: args[3])
let fps = Int32(args.count > 4 ? Int(args[4])! : 30)
let bitRate = args.count > 5 ? Int(args[5])! : 8_000_000
let width = 1920, height = 1080

let frameFiles = try FileManager.default.contentsOfDirectory(atPath: framesDir.path)
  .filter { $0.hasSuffix(".jpg") }.sorted()
guard !frameFiles.isEmpty else { print("Kare yok"); exit(1) }
try? FileManager.default.removeItem(at: outURL)

let writer = try AVAssetWriter(outputURL: outURL, fileType: .mp4)

// ---- görüntü
let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: width,
  AVVideoHeightKey: height,
  AVVideoColorPropertiesKey: [
    AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
    AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
    AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
  ],
  AVVideoCompressionPropertiesKey: [
    AVVideoAverageBitRateKey: bitRate,
    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    AVVideoMaxKeyFrameIntervalKey: 60,
    AVVideoExpectedSourceFrameRateKey: fps,
  ],
])
videoInput.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: videoInput, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
  kCVPixelBufferWidthKey as String: width,
  kCVPixelBufferHeightKey as String: height,
])
writer.add(videoInput)

// ---- ses
let asset = AVURLAsset(url: wavURL)
let audioTrack = asset.tracks(withMediaType: .audio).first!
let reader = try AVAssetReader(asset: asset)
let readerOutput = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: [
  AVFormatIDKey: kAudioFormatLinearPCM,
  AVLinearPCMBitDepthKey: 16,
  AVLinearPCMIsFloatKey: false,
  AVLinearPCMIsBigEndianKey: false,
  AVLinearPCMIsNonInterleaved: false,
  AVSampleRateKey: 44100,
  AVNumberOfChannelsKey: 2,
])
reader.add(readerOutput)
let audioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: [
  AVFormatIDKey: kAudioFormatMPEG4AAC,
  AVSampleRateKey: 44100,
  AVNumberOfChannelsKey: 2,
  AVEncoderBitRateKey: 256_000,
])
audioInput.expectsMediaDataInRealTime = false
writer.add(audioInput)

guard writer.startWriting() else { print("Yazıcı başlatılamadı: \(String(describing: writer.error))"); exit(1) }
writer.startSession(atSourceTime: .zero)
reader.startReading()

let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
func pixelBuffer(for url: URL) -> CVPixelBuffer? {
  guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
        let img = CGImageSourceCreateImageAtIndex(src, 0, nil),
        let pool = adaptor.pixelBufferPool else { return nil }
  var pb: CVPixelBuffer?
  CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pb)
  guard let buf = pb else { return nil }
  CVPixelBufferLockBaseAddress(buf, [])
  defer { CVPixelBufferUnlockBaseAddress(buf, []) }
  let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: width, height: height, bitsPerComponent: 8,
                      bytesPerRow: CVPixelBufferGetBytesPerRow(buf), space: colorSpace,
                      bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
  ctx.draw(img, in: CGRect(x: 0, y: 0, width: width, height: height))
  return buf
}

let group = DispatchGroup()
let videoQueue = DispatchQueue(label: "video")
let audioQueue = DispatchQueue(label: "audio")
var frameIndex = 0
var failed = false

group.enter()
videoInput.requestMediaDataWhenReady(on: videoQueue) {
  while videoInput.isReadyForMoreMediaData {
    if frameIndex >= frameFiles.count {
      videoInput.markAsFinished()
      group.leave()
      return
    }
    let url = framesDir.appendingPathComponent(frameFiles[frameIndex])
    guard let buf = pixelBuffer(for: url) else { print("Kare okunamadı: \(url.lastPathComponent)"); failed = true; videoInput.markAsFinished(); group.leave(); return }
    let time = CMTime(value: CMTimeValue(frameIndex), timescale: fps)
    if !adaptor.append(buf, withPresentationTime: time) { print("Kare eklenemedi: \(String(describing: writer.error))"); failed = true; videoInput.markAsFinished(); group.leave(); return }
    frameIndex += 1
    if frameIndex % 300 == 0 { print("kare \(frameIndex)/\(frameFiles.count)") }
  }
}

group.enter()
audioInput.requestMediaDataWhenReady(on: audioQueue) {
  while audioInput.isReadyForMoreMediaData {
    if let sample = readerOutput.copyNextSampleBuffer() {
      audioInput.append(sample)
    } else {
      audioInput.markAsFinished()
      group.leave()
      return
    }
  }
}

group.wait()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
if failed || writer.status != .completed {
  print("❌ Hata: \(String(describing: writer.error))")
  exit(1)
}
print("✓ \(outURL.path) (\(frameFiles.count) kare, \(Double(frameFiles.count) / Double(fps)) sn)")
