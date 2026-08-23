#pragma once

#include "GraphicsProtocol.hpp"
#include "LocalIPC.hpp"

#include <array>
#include <vector>

namespace gfx {

using PathPoint = std::array<float, 2>;

struct PathTriangles {
    std::vector<PathPoint> fill;
    std::vector<PathPoint> stroke;
};

PathTriangles tessellatePath(const std::vector<mgfx::ipc::PathSegment>& segments,
                             bool fill,
                             bool stroke,
                             FillRule fillRule,
                             LineCap lineCap,
                             LineJoin lineJoin,
                             float strokeWidth,
                             float tolerance,
                             float dashLength = 0.0F,
                             float gapLength = 0.0F,
                             float dashOffset = 0.0F,
                             float miterLimit = 4.0F,
                             const std::vector<float>& dashPattern = {});

} // namespace gfx
