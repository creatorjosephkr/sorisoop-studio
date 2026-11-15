import AppKit
import Foundation

let width: CGFloat = 660
let height: CGFloat = 400

let rep = NSBitmapImageRep(
  bitmapDataPlanes: nil,
  pixelsWide: Int(width),
  pixelsHigh: Int(height),
  bitsPerSample: 8,
  samplesPerPixel: 4,
  hasAlpha: true,
  isPlanar: false,
  colorSpaceName: .deviceRGB,
  bytesPerRow: 0,
  bitsPerPixel: 0
)!
rep.size = NSSize(width: width, height: height)

NSGraphicsContext.saveGraphicsState()
let ctx = NSGraphicsContext(bitmapImageRep: rep)!
NSGraphicsContext.current = ctx
let cg = ctx.cgContext

// 1. Dark slate-indigo background gradient
let bgColors = [
  NSColor(calibratedRed: 0.043, green: 0.067, blue: 0.125, alpha: 1.0).cgColor,
  NSColor(calibratedRed: 0.075, green: 0.102, blue: 0.180, alpha: 1.0).cgColor,
] as CFArray
let bgGradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: bgColors, locations: [0.0, 1.0])!
cg.drawLinearGradient(
  bgGradient,
  start: CGPoint(x: 0, y: height),
  end: CGPoint(x: width, y: 0),
  options: []
)

// 2. Subtle ambient radial glows behind left & right icon slots
func drawGlow(center: CGPoint, radius: CGFloat, color: NSColor) {
  let colors = [color.cgColor, color.withAlphaComponent(0).cgColor] as CFArray
  let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0.0, 1.0])!
  cg.drawRadialGradient(
    grad,
    startCenter: center,
    startRadius: 0,
    endCenter: center,
    endRadius: radius,
    options: []
  )
}

let iconCenterY: CGFloat = height - 188 // top-down y=188 -> bottom-up y=212
drawGlow(center: CGPoint(x: 185, y: iconCenterY), radius: 135, color: NSColor(calibratedRed: 0.133, green: 0.827, blue: 0.933, alpha: 0.14))
drawGlow(center: CGPoint(x: 475, y: iconCenterY), radius: 135, color: NSColor(calibratedRed: 0.388, green: 0.400, blue: 0.945, alpha: 0.15))

// 3. Subtle circular/rounded-rect drop-zone halos
for x in [CGFloat(185), CGFloat(475)] {
  let rect = CGRect(x: x - 74, y: iconCenterY - 74, width: 148, height: 148)
  let path = NSBezierPath(roundedRect: rect, xRadius: 28, yRadius: 28)
  NSColor(calibratedWhite: 1.0, alpha: 0.03).setFill()
  path.fill()
  NSColor(calibratedWhite: 1.0, alpha: 0.08).setStroke()
  path.lineWidth = 1.0
  path.stroke()
}

// 4. Sleek gradient arrow centered between x=286 and x=374 at iconCenterY
let arrowY = iconCenterY
let arrowPath = NSBezierPath()
arrowPath.move(to: CGPoint(x: 286, y: arrowY - 4))
arrowPath.line(to: CGPoint(x: 350, y: arrowY - 4))
arrowPath.line(to: CGPoint(x: 350, y: arrowY - 13))
arrowPath.line(to: CGPoint(x: 374, y: arrowY))
arrowPath.line(to: CGPoint(x: 350, y: arrowY + 13))
arrowPath.line(to: CGPoint(x: 350, y: arrowY + 4))
arrowPath.line(to: CGPoint(x: 286, y: arrowY + 4))
arrowPath.close()

cg.saveGState()
arrowPath.addClip()
let arrowColors = [
  NSColor(calibratedRed: 0.133, green: 0.827, blue: 0.933, alpha: 0.95).cgColor,
  NSColor(calibratedRed: 0.506, green: 0.549, blue: 0.973, alpha: 0.95).cgColor,
] as CFArray
let arrowGrad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: arrowColors, locations: [0.0, 1.0])!
cg.drawLinearGradient(
  arrowGrad,
  start: CGPoint(x: 286, y: arrowY),
  end: CGPoint(x: 374, y: arrowY),
  options: []
)
cg.restoreGState()

// 5. Title and instruction text
let paragraph = NSMutableParagraphStyle()
paragraph.alignment = .center

let titleAttrs: [NSAttributedString.Key: Any] = [
  .font: NSFont.systemFont(ofSize: 16, weight: .semibold),
  .foregroundColor: NSColor(calibratedRed: 0.945, green: 0.961, blue: 0.976, alpha: 0.95),
  .paragraphStyle: paragraph,
]
NSString(string: "소리숲 뮤직비디오 스튜디오").draw(
  in: CGRect(x: 0, y: height - 58, width: width, height: 26),
  withAttributes: titleAttrs
)

let subAttrs: [NSAttributedString.Key: Any] = [
  .font: NSFont.systemFont(ofSize: 12, weight: .regular),
  .foregroundColor: NSColor(calibratedRed: 0.580, green: 0.639, blue: 0.722, alpha: 0.95),
  .paragraphStyle: paragraph,
]
NSString(string: "왼쪽 앱 아이콘을 오른쪽 Applications 폴더로 드래그하여 설치하세요").draw(
  in: CGRect(x: 0, y: 34, width: width, height: 22),
  withAttributes: subAttrs
)

NSGraphicsContext.restoreGraphicsState()

let outUrl = URL(fileURLWithPath: "build/mac/dmg-background.png")
try! rep.representation(using: .png, properties: [:])!.write(to: outUrl)
print("Generated \(outUrl.path)")
