#pragma once

#include "GraphicsProtocol.hpp"
#include "VectorPath.hpp"

#include <string>
#include <vector>

namespace gfx {

struct ShapedText {
    std::vector<PathPoint> triangles;
    float advance = 0.0F;
};

// Shapes UTF-8 with the platform text engine and returns glyph outlines in em
// units, with (0, 0) at the top-left and positive Y moving downward.
ShapedText shapeSystemText(const std::string& utf8, FontFamily family,
                            FontWeight weight = FontWeight::regular,
                            FontStyle style = FontStyle::regular,
                            float letterSpacing = 0.0F);
float measureSystemText(const std::string& utf8, FontFamily family,
                        FontWeight weight = FontWeight::regular,
                        FontStyle style = FontStyle::regular,
                        float letterSpacing = 0.0F);

} // namespace gfx
