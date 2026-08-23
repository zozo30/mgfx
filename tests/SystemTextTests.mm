#include "SystemText.hpp"

#include <cmath>
#include <iostream>

int main() {
    const gfx::ShapedText sans = gfx::shapeSystemText("Hello, MGFX — Ω", gfx::FontFamily::systemSans);
    if (sans.triangles.empty() || sans.triangles.size() % 3 != 0 || sans.advance <= 0.0F) {
        std::cerr << "System Unicode shaping produced no drawable glyph geometry\n";
        return 1;
    }
    if (std::fabs(gfx::measureSystemText("Hello, MGFX — Ω", gfx::FontFamily::systemSans) -
                  sans.advance) > 0.0001F) {
        std::cerr << "Fast text measurement disagrees with shaped geometry metrics\n";
        return 1;
    }
    const gfx::ShapedText mono = gfx::shapeSystemText("iiiiWWWW", gfx::FontFamily::systemMonospace);
    if (mono.triangles.empty() || mono.advance <= 4.0F || mono.advance >= 6.0F) {
        std::cerr << "Monospaced system font metrics are implausible\n";
        return 1;
    }
    for (const gfx::PathPoint& point : sans.triangles) {
        if (!std::isfinite(point[0]) || !std::isfinite(point[1])) {
            std::cerr << "System glyph outline contains non-finite geometry\n";
            return 1;
        }
    }
    return 0;
}
