#include "VectorPath.hpp"

#include <cmath>
#include <iostream>

namespace {

double triangleArea(const std::vector<gfx::PathPoint>& points) {
    double area = 0.0;
    for (std::size_t index = 0; index + 2 < points.size(); index += 3) {
        const auto& a = points[index];
        const auto& b = points[index + 1];
        const auto& c = points[index + 2];
        area += std::fabs((b[0] - a[0]) * (c[1] - a[1]) -
                         (c[0] - a[0]) * (b[1] - a[1])) * 0.5;
    }
    return area;
}

mgfx::ipc::PathSegment point(mgfx::ipc::PathVerb verb, float x, float y) {
    return {verb, {x, y}};
}

} // namespace

int main() {
    const std::vector<mgfx::ipc::PathSegment> compound = {
        point(mgfx::ipc::PathVerb::moveTo, 0, 0),
        point(mgfx::ipc::PathVerb::lineTo, 100, 0),
        point(mgfx::ipc::PathVerb::lineTo, 100, 100),
        point(mgfx::ipc::PathVerb::lineTo, 0, 100),
        {mgfx::ipc::PathVerb::close, {}},
        point(mgfx::ipc::PathVerb::moveTo, 30, 30),
        point(mgfx::ipc::PathVerb::lineTo, 70, 30),
        point(mgfx::ipc::PathVerb::lineTo, 70, 70),
        point(mgfx::ipc::PathVerb::lineTo, 30, 70),
        {mgfx::ipc::PathVerb::close, {}},
    };
    const gfx::PathTriangles fill = gfx::tessellatePath(compound, true, false,
        gfx::FillRule::evenodd, gfx::LineCap::butt, gfx::LineJoin::bevel, 0, 0.25F);
    if (fill.fill.empty() || fill.fill.size() % 3 != 0 ||
        std::fabs(triangleArea(fill.fill) - 8400.0) > 0.01) {
        std::cerr << "Server even-odd fill tessellation failed\n";
        return 1;
    }
    const gfx::PathTriangles nonzeroSolid = gfx::tessellatePath(compound, true, false,
        gfx::FillRule::nonzero, gfx::LineCap::butt, gfx::LineJoin::bevel, 0, 0.25F);
    std::vector<mgfx::ipc::PathSegment> opposite = compound;
    opposite[6] = point(mgfx::ipc::PathVerb::lineTo, 30, 70);
    opposite[7] = point(mgfx::ipc::PathVerb::lineTo, 70, 70);
    opposite[8] = point(mgfx::ipc::PathVerb::lineTo, 70, 30);
    const gfx::PathTriangles nonzeroHole = gfx::tessellatePath(opposite, true, false,
        gfx::FillRule::nonzero, gfx::LineCap::butt, gfx::LineJoin::bevel, 0, 0.25F);
    if (std::fabs(triangleArea(nonzeroSolid.fill) - 10000.0) > 0.01 ||
        std::fabs(triangleArea(nonzeroHole.fill) - 8400.0) > 0.01) {
        std::cerr << "Server nonzero winding tessellation failed\n";
        return 1;
    }

    const std::vector<mgfx::ipc::PathSegment> curve = {
        point(mgfx::ipc::PathVerb::moveTo, 0, 100),
        {mgfx::ipc::PathVerb::cubicTo, {0, 0, 100, 0, 100, 100}},
        point(mgfx::ipc::PathVerb::lineTo, 0, 100),
        {mgfx::ipc::PathVerb::close, {}},
    };
    const gfx::PathTriangles coarse = gfx::tessellatePath(curve, true, false,
        gfx::FillRule::nonzero, gfx::LineCap::butt, gfx::LineJoin::bevel, 0, 8.0F);
    const gfx::PathTriangles fine = gfx::tessellatePath(curve, true, false,
        gfx::FillRule::nonzero, gfx::LineCap::butt, gfx::LineJoin::bevel, 0, 0.25F);
    if (fine.fill.size() <= coarse.fill.size()) {
        std::cerr << "Server adaptive cubic flattening failed\n";
        return 1;
    }

    const std::vector<mgfx::ipc::PathSegment> strokePath = {
        point(mgfx::ipc::PathVerb::moveTo, 2, 12),
        point(mgfx::ipc::PathVerb::lineTo, 22, 12),
    };
    const gfx::PathTriangles stroke = gfx::tessellatePath(strokePath, false, true,
        gfx::FillRule::nonzero, gfx::LineCap::round, gfx::LineJoin::round, 2, 0.25F);
    if (!stroke.fill.empty() || stroke.stroke.size() <= 6 || stroke.stroke.size() % 3 != 0) {
        std::cerr << "Server stroke tessellation failed\n";
        return 1;
    }

    const gfx::PathTriangles buttStroke = gfx::tessellatePath(strokePath, false, true,
        gfx::FillRule::nonzero, gfx::LineCap::butt, gfx::LineJoin::bevel, 2, 0.25F);
    if (std::fabs(triangleArea(buttStroke.stroke) - 40.0) > 0.001) {
        std::cerr << "Butt-capped stroke contains gaps or overlapping triangles\n";
        return 1;
    }
    const gfx::PathTriangles squareCapStroke = gfx::tessellatePath(strokePath, false, true,
        gfx::FillRule::nonzero, gfx::LineCap::square, gfx::LineJoin::bevel, 2, 0.25F);
    if (std::fabs(triangleArea(squareCapStroke.stroke) - 44.0) > 0.001) {
        std::cerr << "Square caps do not extend by one half-width\n";
        return 1;
    }
    const gfx::PathTriangles dashedStroke = gfx::tessellatePath(strokePath, false, true,
        gfx::FillRule::nonzero, gfx::LineCap::butt, gfx::LineJoin::bevel,
        2, 0.25F, 4, 2, 0);
    if (std::fabs(triangleArea(dashedStroke.stroke) - 28.0) > 0.001) {
        std::cerr << "Server dash splitting did not preserve exact painted length\n";
        return 1;
    }
    const double roundArea = triangleArea(stroke.stroke);
    if (roundArea <= 43.0 || roundArea >= 43.2) {
        std::cerr << "Round caps do not form a non-overlapping semicircle pair\n";
        return 1;
    }

    const std::vector<mgfx::ipc::PathSegment> elbow = {
        point(mgfx::ipc::PathVerb::moveTo, 0, 0),
        point(mgfx::ipc::PathVerb::lineTo, 10, 0),
        point(mgfx::ipc::PathVerb::lineTo, 10, 10),
    };
    const gfx::PathTriangles bevelElbow = gfx::tessellatePath(elbow, false, true,
        gfx::FillRule::nonzero, gfx::LineCap::butt, gfx::LineJoin::bevel, 2, 0.25F);
    const gfx::PathTriangles roundElbow = gfx::tessellatePath(elbow, false, true,
        gfx::FillRule::nonzero, gfx::LineCap::butt, gfx::LineJoin::round, 2, 0.25F);
    const double joinDifference = triangleArea(roundElbow.stroke) -
                                  triangleArea(bevelElbow.stroke);
    if (joinDifference <= 0.27 || joinDifference >= 0.30) {
        std::cerr << "Round join is not a clean outer-corner arc\n";
        return 1;
    }
    const gfx::PathTriangles miterElbow = gfx::tessellatePath(elbow, false, true,
        gfx::FillRule::nonzero, gfx::LineCap::butt, gfx::LineJoin::miter, 2, 0.25F);
    const double miterDifference = triangleArea(miterElbow.stroke) -
                                   triangleArea(bevelElbow.stroke);
    if (miterDifference <= 0.49 || miterDifference >= 0.51) {
        std::cerr << "Miter join does not meet at the exact outer intersection\n";
        return 1;
    }
    const gfx::PathTriangles limitedMiterElbow = gfx::tessellatePath(elbow, false, true,
        gfx::FillRule::nonzero, gfx::LineCap::butt, gfx::LineJoin::miter, 2, 0.25F,
        0, 0, 0, 1);
    if (std::fabs(triangleArea(limitedMiterElbow.stroke) -
                  triangleArea(bevelElbow.stroke)) > 0.001) {
        std::cerr << "Miter limit does not fall back to a bevel join\n";
        return 1;
    }

    const std::vector<mgfx::ipc::PathSegment> closedSquare = {
        point(mgfx::ipc::PathVerb::moveTo, 0, 0),
        point(mgfx::ipc::PathVerb::lineTo, 10, 0),
        point(mgfx::ipc::PathVerb::lineTo, 10, 10),
        point(mgfx::ipc::PathVerb::lineTo, 0, 10),
        {mgfx::ipc::PathVerb::close, {}},
    };
    const gfx::PathTriangles squareStroke = gfx::tessellatePath(closedSquare, false, true,
        gfx::FillRule::nonzero, gfx::LineCap::butt, gfx::LineJoin::bevel, 2, 0.25F);
    if (std::fabs(triangleArea(squareStroke.stroke) - 78.0) > 0.001) {
        std::cerr << "Closed bevel stroke contains gaps or overlapping triangles\n";
        return 1;
    }
    return 0;
}
