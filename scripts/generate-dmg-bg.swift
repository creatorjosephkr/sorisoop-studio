import AppKit
import Foundation

let width: CGFloat = 660
let height: CGFloat = 400
let colorSpace = CGColorSpaceCreateDeviceRGB()

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

func rgba(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1.0) -> NSColor {
  NSColor(calibratedRed: r / 255.0, green: g / 255.0, blue: b / 255.0, alpha: a)
}

func drawGlow(center: CGPoint, radius: CGFloat, color: NSColor) {
  let colors = [color.cgColor, color.withAlphaComponent(0).cgColor] as CFArray
  let grad = CGGradient(colorsSpace: colorSpace, colors: colors, locations: [0.0, 1.0])!
  cg.drawRadialGradient(
    grad,
    startCenter: center,
    startRadius: 0,
    endCenter: center,
    endRadius: radius,
    options: []
  )
}

// 1. Deep Studio Gradient Background (#060913 -> #0c1326 -> #121936)
let bgColors = [
  rgba(6, 9, 19).cgColor,
  rgba(12, 19, 38).cgColor,
  rgba(18, 25, 54).cgColor,
] as CFArray
let bgGradient = CGGradient(colorsSpace: colorSpace, colors: bgColors, locations: [0.0, 0.55, 1.0])!
cg.drawLinearGradient(
  bgGradient,
  start: CGPoint(x: 0, y: height),
  end: CGPoint(x: width, y: 0),
  options: []
)

// Subtle aurora radial glows
let iconCenterY: CGFloat = height - 170 // top-down 170 -> bottom-up 230
drawGlow(center: CGPoint(x: width * 0.5, y: height - 20), radius: 240, color: rgba(34, 211, 238, 0.14))
drawGlow(center: CGPoint(x: 185, y: iconCenterY), radius: 155, color: rgba(34, 211, 238, 0.18))
drawGlow(center: CGPoint(x: 475, y: iconCenterY), radius: 155, color: rgba(139, 92, 246, 0.19))
drawGlow(center: CGPoint(x: 560, y: 60), radius: 160, color: rgba(236, 72, 153, 0.11))

// 2. Decorative hologram silk soundwave curves sweeping horizontally behind cards
let waveConfigs: [(amp: CGFloat, freq: CGFloat, phase: CGFloat, yOff: CGFloat, color: NSColor, width: CGFloat)] = [
  (14, 2.2, 0.2, 240, rgba(34, 211, 238, 0.16), 1.5),
  (18, 1.7, 1.5, 228, rgba(139, 92, 246, 0.15), 1.3),
  (11, 2.9, 2.8, 218, rgba(236, 72, 153, 0.12), 1.1),
]
for w in waveConfigs {
  let path = NSBezierPath()
  let steps = 80
  for i in 0...steps {
    let u = CGFloat(i) / CGFloat(steps)
    let x = u * width
    let env = sin(u * .pi)
    let y = w.yOff + sin(u * .pi * w.freq + w.phase) * w.amp * env
    if i == 0 {
      path.move(to: CGPoint(x: x, y: y))
    } else {
      path.line(to: CGPoint(x: x, y: y))
    }
  }
  w.color.setStroke()
  path.lineWidth = w.width
  path.stroke()
}

// 3. Top Header: Badge + App Name + Subtitle
let centerPara = NSMutableParagraphStyle()
centerPara.alignment = .center

let badgeRect = CGRect(x: (width - 144) / 2, y: 364, width: 144, height: 19)
let badgePath = NSBezierPath(roundedRect: badgeRect, xRadius: 9.5, yRadius: 9.5)
rgba(34, 211, 238, 0.12).setFill()
badgePath.fill()
rgba(34, 211, 238, 0.45).setStroke()
badgePath.lineWidth = 1.0
badgePath.stroke()

let badgeAttrs: [NSAttributedString.Key: Any] = [
  .font: NSFont.systemFont(ofSize: 9.5, weight: .bold),
  .foregroundColor: rgba(103, 232, 249, 0.98),
  .kern: 1.1,
  .paragraphStyle: centerPara,
]
NSString(string: "SORISOOP MV STUDIO").draw(
  in: CGRect(x: 0, y: 366, width: width, height: 14),
  withAttributes: badgeAttrs
)

let titleAttrs: [NSAttributedString.Key: Any] = [
  .font: NSFont.systemFont(ofSize: 20, weight: .bold),
  .foregroundColor: rgba(248, 250, 252, 0.98),
  .paragraphStyle: centerPara,
]
NSString(string: "소리숲 뮤직비디오 스튜디오").draw(
  in: CGRect(x: 0, y: 334, width: width, height: 26),
  withAttributes: titleAttrs
)

let subTitleAttrs: [NSAttributedString.Key: Any] = [
  .font: NSFont.systemFont(ofSize: 11.5, weight: .medium),
  .foregroundColor: rgba(148, 163, 184, 0.92),
  .paragraphStyle: centerPara,
]
NSString(string: "AI 가사 싱크 & 음악 반응형 홀로그램 뮤직비디오 제작 스튜디오").draw(
  in: CGRect(x: 0, y: 314, width: width, height: 18),
  withAttributes: subTitleAttrs
)

// 4. Left & Right Glass Icon Cards + Bright Label Background Pills (no baked-in text so Finder labels never double)
struct CardSpec {
  let centerX: CGFloat
  let accent: NSColor
  let pillWidth: CGFloat
}

let cards = [
  CardSpec(centerX: 185, accent: rgba(34, 211, 238, 0.52), pillWidth: 214),
  CardSpec(centerX: 475, accent: rgba(139, 92, 246, 0.52), pillWidth: 126),
]

for card in cards {
  let cardW: CGFloat = 148
  let cardH: CGFloat = 120
  let cardRect = CGRect(x: card.centerX - cardW / 2, y: (iconCenterY + 2) - cardH / 2, width: cardW, height: cardH)
  let cardPath = NSBezierPath(roundedRect: cardRect, xRadius: 24, yRadius: 24)

  cg.saveGState()
  cardPath.addClip()
  let cardBg = [
    rgba(255, 255, 255, 0.08).cgColor,
    rgba(255, 255, 255, 0.025).cgColor,
  ] as CFArray
  let cardGrad = CGGradient(colorsSpace: colorSpace, colors: cardBg, locations: [0.0, 1.0])!
  cg.drawLinearGradient(
    cardGrad,
    start: CGPoint(x: cardRect.midX, y: cardRect.maxY),
    end: CGPoint(x: cardRect.midX, y: cardRect.minY),
    options: []
  )
  cg.restoreGState()

  card.accent.setStroke()
  cardPath.lineWidth = 1.25
  cardPath.stroke()

  // Bright frosted pill directly behind Finder's real filename label (y_bottom_up = 140..167)
  let pillH: CGFloat = 27
  let pillRect = CGRect(x: card.centerX - card.pillWidth / 2, y: 140, width: card.pillWidth, height: pillH)
  let pillPath = NSBezierPath(roundedRect: pillRect, xRadius: 10, yRadius: 10)

  cg.saveGState()
  pillPath.addClip()
  let pillColors = [
    rgba(241, 245, 249, 0.96).cgColor,
    rgba(226, 232, 240, 0.92).cgColor,
  ] as CFArray
  let pillGrad = CGGradient(colorsSpace: colorSpace, colors: pillColors, locations: [0.0, 1.0])!
  cg.drawLinearGradient(
    pillGrad,
    start: CGPoint(x: pillRect.midX, y: pillRect.maxY),
    end: CGPoint(x: pillRect.midX, y: pillRect.minY),
    options: []
  )
  cg.restoreGState()

  card.accent.withAlphaComponent(0.45).setStroke()
  pillPath.lineWidth = 1.0
  pillPath.stroke()
}

// 5. Central Neon Gradient Arrow & "DRAG & DROP" pill
let arrowY = iconCenterY + 6
let arrowPath = NSBezierPath()
arrowPath.move(to: CGPoint(x: 286, y: arrowY - 3.5))
arrowPath.line(to: CGPoint(x: 348, y: arrowY - 3.5))
arrowPath.line(to: CGPoint(x: 348, y: arrowY - 12))
arrowPath.line(to: CGPoint(x: 374, y: arrowY))
arrowPath.line(to: CGPoint(x: 348, y: arrowY + 12))
arrowPath.line(to: CGPoint(x: 348, y: arrowY + 3.5))
arrowPath.line(to: CGPoint(x: 286, y: arrowY + 3.5))
arrowPath.close()

cg.saveGState()
arrowPath.addClip()
let arrowColors = [
  rgba(34, 211, 238, 0.98).cgColor,
  rgba(99, 102, 241, 0.98).cgColor,
  rgba(236, 72, 153, 0.95).cgColor,
] as CFArray
let arrowGrad = CGGradient(colorsSpace: colorSpace, colors: arrowColors, locations: [0.0, 0.55, 1.0])!
cg.drawLinearGradient(
  arrowGrad,
  start: CGPoint(x: 286, y: arrowY),
  end: CGPoint(x: 374, y: arrowY),
  options: []
)
cg.restoreGState()

let dragPillRect = CGRect(x: 289, y: iconCenterY - 28, width: 82, height: 17)
let dragPillPath = NSBezierPath(roundedRect: dragPillRect, xRadius: 8.5, yRadius: 8.5)
rgba(15, 23, 42, 0.85).setFill()
dragPillPath.fill()
rgba(129, 140, 248, 0.45).setStroke()
dragPillPath.lineWidth = 0.9
dragPillPath.stroke()

let dragAttrs: [NSAttributedString.Key: Any] = [
  .font: NSFont.systemFont(ofSize: 8.5, weight: .bold),
  .foregroundColor: rgba(165, 243, 252, 0.95),
  .kern: 0.7,
  .paragraphStyle: centerPara,
]
NSString(string: "DRAG & DROP").draw(
  in: CGRect(x: 289, y: iconCenterY - 25.5, width: 82, height: 13),
  withAttributes: dragAttrs
)

// 6. Bottom Installation Instruction Glass Panel
let guideRect = CGRect(x: 36, y: 16, width: width - 72, height: 68)
let guidePath = NSBezierPath(roundedRect: guideRect, xRadius: 16, yRadius: 16)
cg.saveGState()
guidePath.addClip()
let guideBg = [
  rgba(15, 23, 42, 0.88).cgColor,
  rgba(15, 23, 42, 0.72).cgColor,
] as CFArray
let guideGrad = CGGradient(colorsSpace: colorSpace, colors: guideBg, locations: [0.0, 1.0])!
cg.drawLinearGradient(
  guideGrad,
  start: CGPoint(x: guideRect.midX, y: guideRect.maxY),
  end: CGPoint(x: guideRect.midX, y: guideRect.minY),
  options: []
)
cg.restoreGState()
rgba(56, 189, 248, 0.28).setStroke()
guidePath.lineWidth = 1.0
guidePath.stroke()

let stepAttrs: [NSAttributedString.Key: Any] = [
  .font: NSFont.systemFont(ofSize: 12.5, weight: .semibold),
  .foregroundColor: rgba(241, 245, 249, 0.97),
  .paragraphStyle: centerPara,
]
NSString(string: "설치 방법  |  왼쪽 앱 아이콘을 오른쪽 Applications 폴더로 드래그하세요").draw(
  in: CGRect(x: guideRect.minX + 12, y: 50, width: guideRect.width - 24, height: 20),
  withAttributes: stepAttrs
)

let tipAttrs: [NSAttributedString.Key: Any] = [
  .font: NSFont.systemFont(ofSize: 10.5, weight: .regular),
  .foregroundColor: rgba(148, 163, 184, 0.94),
  .paragraphStyle: centerPara,
]
NSString(string: "설치 완료 후 Launchpad 또는 응용 프로그램(Applications) 폴더에서 바로 실행할 수 있습니다").draw(
  in: CGRect(x: guideRect.minX + 12, y: 27, width: guideRect.width - 24, height: 17),
  withAttributes: tipAttrs
)

NSGraphicsContext.restoreGraphicsState()

let outUrl = URL(fileURLWithPath: "build/mac/dmg-background.png")
try! rep.representation(using: .png, properties: [:])!.write(to: outUrl)
print("Generated \(outUrl.path)")
