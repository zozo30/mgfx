#include "SystemText.hpp"

#import <CoreText/CoreText.h>
#import <Foundation/Foundation.h>

#include <vector>

namespace gfx {
namespace {

constexpr float designSize = 1000.0F;

struct PathBuilder {
    std::vector<mgfx::ipc::PathSegment> segments;
    PathPoint current{0.0F, 0.0F};
    PathPoint contourStart{0.0F, 0.0F};
};

void appendPathElement(void* context, const CGPathElement* element) {
    auto& builder = *static_cast<PathBuilder*>(context);
    const auto point = [](CGPoint value) {
        return PathPoint{static_cast<float>(value.x), static_cast<float>(value.y)};
    };
    switch (element->type) {
    case kCGPathElementMoveToPoint: {
        builder.current = point(element->points[0]);
        builder.contourStart = builder.current;
        builder.segments.push_back({mgfx::ipc::PathVerb::moveTo,
                                    {builder.current[0], builder.current[1]}});
        break;
    }
    case kCGPathElementAddLineToPoint: {
        builder.current = point(element->points[0]);
        builder.segments.push_back({mgfx::ipc::PathVerb::lineTo,
                                    {builder.current[0], builder.current[1]}});
        break;
    }
    case kCGPathElementAddQuadCurveToPoint: {
        const PathPoint control = point(element->points[0]);
        const PathPoint end = point(element->points[1]);
        const PathPoint control1 = {
            builder.current[0] + (control[0] - builder.current[0]) * 2.0F / 3.0F,
            builder.current[1] + (control[1] - builder.current[1]) * 2.0F / 3.0F};
        const PathPoint control2 = {
            end[0] + (control[0] - end[0]) * 2.0F / 3.0F,
            end[1] + (control[1] - end[1]) * 2.0F / 3.0F};
        builder.segments.push_back({mgfx::ipc::PathVerb::cubicTo,
            {control1[0], control1[1], control2[0], control2[1], end[0], end[1]}});
        builder.current = end;
        break;
    }
    case kCGPathElementAddCurveToPoint: {
        const PathPoint control1 = point(element->points[0]);
        const PathPoint control2 = point(element->points[1]);
        const PathPoint end = point(element->points[2]);
        builder.segments.push_back({mgfx::ipc::PathVerb::cubicTo,
            {control1[0], control1[1], control2[0], control2[1], end[0], end[1]}});
        builder.current = end;
        break;
    }
    case kCGPathElementCloseSubpath:
        builder.segments.push_back({mgfx::ipc::PathVerb::close, {}});
        builder.current = builder.contourStart;
        break;
    }
}

CTFontRef createFont(FontFamily family) {
    const CTFontUIFontType type = family == FontFamily::systemMonospace
        ? kCTFontUIFontUserFixedPitch : kCTFontUIFontSystem;
    return CTFontCreateUIFontForLanguage(type, designSize, nullptr);
}

} // namespace

ShapedText shapeSystemText(const std::string& utf8, FontFamily family) {
    ShapedText shaped;
    NSString* string = [[NSString alloc] initWithBytes:utf8.data()
                                              length:utf8.size()
                                            encoding:NSUTF8StringEncoding];
    if (string == nil || string.length == 0) return shaped;
    CTFontRef baseFont = createFont(family);
    if (baseFont == nullptr) return shaped;
    NSDictionary* attributes = @{(__bridge id)kCTFontAttributeName: (__bridge id)baseFont};
    NSAttributedString* attributed = [[NSAttributedString alloc] initWithString:string
                                                                     attributes:attributes];
    CTLineRef line = CTLineCreateWithAttributedString((__bridge CFAttributedStringRef)attributed);
    if (line == nullptr) {
        CFRelease(baseFont);
        return shaped;
    }
    CGFloat ascent = 0.0, descent = 0.0, leading = 0.0;
    shaped.advance = static_cast<float>(CTLineGetTypographicBounds(
        line, &ascent, &descent, &leading) / designSize);
    const CFArrayRef runs = CTLineGetGlyphRuns(line);
    for (CFIndex runIndex = 0; runIndex < CFArrayGetCount(runs); ++runIndex) {
        CTRunRef run = static_cast<CTRunRef>(const_cast<void*>(
            CFArrayGetValueAtIndex(runs, runIndex)));
        const CFIndex count = CTRunGetGlyphCount(run);
        if (count <= 0) continue;
        std::vector<CGGlyph> glyphs(static_cast<std::size_t>(count));
        std::vector<CGPoint> positions(static_cast<std::size_t>(count));
        CTRunGetGlyphs(run, CFRangeMake(0, count), glyphs.data());
        CTRunGetPositions(run, CFRangeMake(0, count), positions.data());
        const CFDictionaryRef runAttributes = CTRunGetAttributes(run);
        CTFontRef runFont = static_cast<CTFontRef>(const_cast<void*>(
            CFDictionaryGetValue(runAttributes, kCTFontAttributeName)));
        if (runFont == nullptr) runFont = baseFont;
        for (CFIndex index = 0; index < count; ++index) {
            CGPathRef path = CTFontCreatePathForGlyph(
                runFont, glyphs[static_cast<std::size_t>(index)], nullptr);
            if (path == nullptr) continue;
            PathBuilder builder;
            CGPathApply(path, &builder, appendPathElement);
            CFRelease(path);
            if (builder.segments.empty()) continue;
            PathTriangles glyph = tessellatePath(builder.segments, true, false,
                FillRule::nonzero, LineCap::butt, LineJoin::bevel, 0.0F, 0.5F);
            const CGPoint position = positions[static_cast<std::size_t>(index)];
            for (const PathPoint& point : glyph.fill) {
                shaped.triangles.push_back({
                    static_cast<float>(position.x + point[0]) / designSize,
                    static_cast<float>(ascent - position.y - point[1]) / designSize});
            }
        }
    }
    CFRelease(line);
    CFRelease(baseFont);
    return shaped;
}

float measureSystemText(const std::string& utf8, FontFamily family) {
    NSString* string = [[NSString alloc] initWithBytes:utf8.data()
                                              length:utf8.size()
                                            encoding:NSUTF8StringEncoding];
    if (string == nil || string.length == 0) return 0.0F;
    CTFontRef font = createFont(family);
    if (font == nullptr) return 0.0F;
    NSDictionary* attributes = @{(__bridge id)kCTFontAttributeName: (__bridge id)font};
    NSAttributedString* attributed = [[NSAttributedString alloc] initWithString:string
                                                                     attributes:attributes];
    CTLineRef line = CTLineCreateWithAttributedString((__bridge CFAttributedStringRef)attributed);
    const float advance = line == nullptr ? 0.0F : static_cast<float>(
        CTLineGetTypographicBounds(line, nullptr, nullptr, nullptr) / designSize);
    if (line != nullptr) CFRelease(line);
    CFRelease(font);
    return advance;
}

} // namespace gfx
