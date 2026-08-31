// Renders the peixAIrada app icon — a fish in Claude terracotta, with a Claude-style starburst for an
// eye, AI sparkles, and a faint node graph for scales. No assets, no dependencies: pure CoreGraphics,
// so the icon is reproducible and scales cleanly to every size macOS asks for.
//   swiftc -O MakeIcon.swift -o makeicon && ./makeicon <outdir>
import Cocoa

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "."
let S: CGFloat = 1024   // design canvas; every size is rendered from scratch at its own resolution

// ---- palette -------------------------------------------------------------------------------
let orangeTop   = CGColor(red: 0.937, green: 0.573, blue: 0.404, alpha: 1)  // #EF9267
let orangeBot   = CGColor(red: 0.706, green: 0.310, blue: 0.184, alpha: 1)  // #B44F2F
let cream       = CGColor(red: 0.984, green: 0.969, blue: 0.937, alpha: 1)  // #FBF7EF
let deep        = CGColor(red: 0.478, green: 0.184, blue: 0.098, alpha: 1)  // #7A2F19

// ---- shapes --------------------------------------------------------------------------------

/// Apple-style squircle (superellipse), so the tile sits right next to system icons.
func squircle(_ r: CGRect, n: CGFloat = 5) -> CGPath {
  let p = CGMutablePath()
  let a = r.width / 2, b = r.height / 2, cx = r.midX, cy = r.midY
  let steps = 720
  for i in 0...steps {
    let t = CGFloat(i) / CGFloat(steps) * 2 * .pi
    let ct = cos(t), st = sin(t)
    let x = cx + a * pow(abs(ct), 2 / n) * (ct < 0 ? -1 : 1)
    let y = cy + b * pow(abs(st), 2 / n) * (st < 0 ? -1 : 1)
    i == 0 ? p.move(to: CGPoint(x: x, y: y)) : p.addLine(to: CGPoint(x: x, y: y))
  }
  p.closeSubpath()
  return p
}

/// Claude-ish starburst: sharp tips, concave sides.
func starburst(center c: CGPoint, radius r: CGFloat, rays: Int = 8, waist: CGFloat = 0.16) -> CGPath {
  let p = CGMutablePath()
  let step = 2 * CGFloat.pi / CGFloat(rays)
  for i in 0..<rays {
    let a = step * CGFloat(i) - .pi / 2
    let tip = CGPoint(x: c.x + cos(a) * r, y: c.y + sin(a) * r)
    let mid = a + step / 2
    let ctl = CGPoint(x: c.x + cos(mid) * r * waist, y: c.y + sin(mid) * r * waist)
    i == 0 ? p.move(to: tip) : p.addLine(to: tip)
    let nextA = a + step
    let next = CGPoint(x: c.x + cos(nextA) * r, y: c.y + sin(nextA) * r)
    p.addQuadCurve(to: next, control: ctl)
  }
  p.closeSubpath()
  return p
}

/// Fish body: a leaf shape (tail joint → nose) with a dorsal and a ventral fin.
func fishBody(tail: CGPoint, nose: CGPoint, bulge: CGFloat) -> CGPath {
  let p = CGMutablePath()
  let dx = nose.x - tail.x
  p.move(to: tail)
  p.addCurve(to: nose, control1: CGPoint(x: tail.x + dx * 0.28, y: tail.y + bulge),
                       control2: CGPoint(x: tail.x + dx * 0.78, y: tail.y + bulge * 0.62))
  p.addCurve(to: tail, control1: CGPoint(x: tail.x + dx * 0.78, y: tail.y - bulge * 0.62),
                       control2: CGPoint(x: tail.x + dx * 0.28, y: tail.y - bulge))
  p.closeSubpath()
  return p
}

func draw(into ctx: CGContext, size: CGFloat) {
  let k = size / S                       // scale everything from the 1024 design canvas
  func P(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * k, y: y * k) }
  func L(_ v: CGFloat) -> CGFloat { v * k }

  ctx.setAllowsAntialiasing(true)
  ctx.interpolationQuality = .high
  // Progressive detail — fine marks turn to mush below ~48px, so the small sizes get a bolder,
  // simpler fish instead of a shrunken version of the big one.
  let showGraph = size >= 96, showSparkles = size >= 48, tiny = size < 48
  let boost: CGFloat = tiny ? 1.14 : 1.0

  // tile + gradient
  let tile = squircle(CGRect(x: L(100), y: L(100), width: L(824), height: L(824)))
  ctx.saveGState()
  ctx.addPath(tile); ctx.clip()
  let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                        colors: [orangeTop, orangeBot] as CFArray, locations: [0, 1])!
  ctx.drawLinearGradient(grad, start: P(200, 924), end: P(824, 100), options: [])
  // soft light from the top-left
  let glow = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                        colors: [CGColor(red: 1, green: 1, blue: 1, alpha: 0.22),
                                 CGColor(red: 1, green: 1, blue: 1, alpha: 0)] as CFArray, locations: [0, 1])!
  ctx.drawRadialGradient(glow, startCenter: P(330, 780), startRadius: 0,
                         endCenter: P(330, 780), endRadius: L(560), options: [])
  ctx.restoreGState()

  // ---- fish --------------------------------------------------------------------------------
  // Each piece is filled separately inside one transparency layer: overlapping fills merge with no
  // winding artefacts, and the layer casts a single shadow around the whole silhouette.
  let tail = P(318, 482), nose = P(814, 494)
  let body = fishBody(tail: tail, nose: nose, bulge: L(190))

  // forked tail: a wedge off the peduncle, so its edges never cross
  let fin = CGMutablePath()
  fin.move(to: P(414, 516))
  fin.addQuadCurve(to: P(204, 656), control: P(310, 596))
  fin.addQuadCurve(to: P(304, 482), control: P(258, 566))
  fin.addQuadCurve(to: P(204, 316), control: P(258, 398))
  fin.addQuadCurve(to: P(414, 450), control: P(310, 368))
  fin.closeSubpath()

  // one modest dorsal fin, swept back towards the tail
  let dorsal = CGMutablePath()
  dorsal.move(to: P(474, 560))
  dorsal.addQuadCurve(to: P(636, 566), control: P(506, 700))
  dorsal.closeSubpath()

  ctx.saveGState()
  ctx.translateBy(x: size / 2, y: size / 2); ctx.scaleBy(x: boost, y: boost)
  ctx.translateBy(x: -size / 2, y: -size / 2)     // scale the fish about the tile centre
  ctx.saveGState()
  ctx.setShadow(offset: CGSize(width: 0, height: L(-12)), blur: L(30),
                color: CGColor(red: 0.35, green: 0.11, blue: 0.04, alpha: 0.30))
  ctx.beginTransparencyLayer(auxiliaryInfo: nil)
  ctx.setFillColor(cream)
  for path in [dorsal, fin, body] { ctx.addPath(path); ctx.fillPath() }
  ctx.endTransparencyLayer()
  ctx.restoreGState()

  // ---- node graph inside the body (large sizes only) ----------------------------------------
  if showGraph {
  ctx.saveGState()
  ctx.addPath(body); ctx.clip()
  let nodes = [P(432, 482), P(518, 544), P(518, 420), P(606, 482)]
  ctx.setStrokeColor(deep.copy(alpha: 0.20)!)
  ctx.setLineWidth(L(9)); ctx.setLineCap(.round)
  for (a, b) in [(0,1),(0,2),(1,3),(2,3)] { ctx.move(to: nodes[a]); ctx.addLine(to: nodes[b]) }
  ctx.strokePath()
  ctx.setFillColor(deep.copy(alpha: 0.30)!)
  for n in nodes { ctx.fillEllipse(in: CGRect(x: n.x - L(16), y: n.y - L(16), width: L(32), height: L(32))) }
  ctx.restoreGState()
  }

  // ---- eye: Claude starburst punched into the head ------------------------------------------
  ctx.setFillColor(deep)
  if tiny { ctx.fillEllipse(in: CGRect(x: P(716, 500).x - L(46), y: P(716, 500).y - L(46), width: L(92), height: L(92))) }
  else { ctx.addPath(starburst(center: P(716, 500), radius: L(40), waist: 0.20)); ctx.fillPath() }
  ctx.restoreGState()   // end fish scale

  // ---- AI sparkles rising like bubbles ------------------------------------------------------
  guard showSparkles else { return }
  ctx.setFillColor(cream)
  ctx.addPath(starburst(center: P(742, 706), radius: L(54), rays: 4, waist: 0.30)); ctx.fillPath()
  ctx.setFillColor(cream.copy(alpha: 0.85)!)
  ctx.addPath(starburst(center: P(838, 606), radius: L(32), rays: 4, waist: 0.30)); ctx.fillPath()
  ctx.setFillColor(cream.copy(alpha: 0.6)!)
  ctx.addPath(starburst(center: P(838, 780), radius: L(22), rays: 4, waist: 0.30)); ctx.fillPath()
}

func render(size: Int) -> CGImage {
  let cs = CGColorSpaceCreateDeviceRGB()
  let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                      space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  draw(into: ctx, size: CGFloat(size))
  return ctx.makeImage()!
}

func write(_ img: CGImage, _ path: String) {
  let url = URL(fileURLWithPath: path)
  let dst = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil)!
  CGImageDestinationAddImage(dst, img, nil)
  CGImageDestinationFinalize(dst)
}

let iconset = "\(out)/peixAIrada.iconset"
try? FileManager.default.createDirectory(atPath: iconset, withIntermediateDirectories: true)
for (pt, scale) in [(16,1),(16,2),(32,1),(32,2),(128,1),(128,2),(256,1),(256,2),(512,1),(512,2)] {
  let px = pt * scale
  let name = scale == 1 ? "icon_\(pt)x\(pt).png" : "icon_\(pt)x\(pt)@2x.png"
  write(render(size: px), "\(iconset)/\(name)")
}
write(render(size: 1024), "\(out)/preview-1024.png")
// a contact sheet, to eyeball the small sizes the way the Dock and menu bar will show them
let sheetW = 1024, sheetH = 300
let cs = CGColorSpaceCreateDeviceRGB()
let sheet = CGContext(data: nil, width: sheetW, height: sheetH, bitsPerComponent: 8, bytesPerRow: 0,
                      space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
sheet.setFillColor(CGColor(red: 0.93, green: 0.93, blue: 0.91, alpha: 1))
sheet.fill(CGRect(x: 0, y: 0, width: sheetW, height: sheetH))
var x = 24
for s in [16, 32, 64, 128, 256] {
  sheet.draw(render(size: s), in: CGRect(x: x, y: 24, width: s, height: s))
  x += s + 24
}
write(sheet.makeImage()!, "\(out)/preview-sizes.png")
print("wrote \(iconset), preview-1024.png, preview-sizes.png")
