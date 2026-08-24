#pragma once

#include "GraphicsProtocol.hpp"
#include "ResourceBudget.hpp"
#include "VectorPath.hpp"

#include <cstddef>
#include <string>
#include <cstdint>
#include <vector>

namespace gfx {

struct ShapedText {
    std::vector<PathPoint> triangles;
    std::vector<PathPoint> strokeTriangles;
    float advance = 0.0F;
    float ascent = 0.0F;
    float underlinePosition = 0.0F;
    float underlineThickness = 0.0F;
    float strikeThroughPosition = 0.0F;
    float strikeThroughThickness = 0.0F;
};

struct GlyphGeometryCacheStats final {
    std::size_t entries = 0;
    std::size_t points = 0;
    std::uint64_t hits = 0;
    std::uint64_t misses = 0;
    std::uint64_t evictions = 0;
};

// Shapes UTF-8 with the platform text engine and returns glyph outlines in em
// units, with (0, 0) at the top-left and positive Y moving downward.
ShapedText shapeSystemText(const std::string& utf8, FontFamily family,
                            FontWeight weight = FontWeight::regular,
                            FontStyle style = FontStyle::regular,
                            float letterSpacing = 0.0F,
                            std::uint32_t fontResourceId = 0,
                            float strokeWidth = 0.0F);
float measureSystemText(const std::string& utf8, FontFamily family,
                        FontWeight weight = FontWeight::regular,
                        FontStyle style = FontStyle::regular,
                        float letterSpacing = 0.0F,
                        std::uint32_t fontResourceId = 0);
bool createFontResource(std::uint32_t id, const std::vector<std::uint8_t>& bytes);
void destroyFontResource(std::uint32_t id);
void clearFontResources();
std::uint64_t fontResourceVersion(std::uint32_t id);
ResourceUsage fontResourceUsage();
GlyphGeometryCacheStats glyphGeometryCacheStats();
void clearGlyphGeometryCache();

} // namespace gfx
