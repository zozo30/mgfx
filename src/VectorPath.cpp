#include "VectorPath.hpp"

#include <mapbox/earcut.hpp>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <limits>

namespace gfx {
namespace {

struct Contour {
    std::vector<PathPoint> points;
    bool closed = false;
};

PathPoint midpoint(const PathPoint& a, const PathPoint& b) {
    return {(a[0] + b[0]) * 0.5F, (a[1] + b[1]) * 0.5F};
}

float distanceToLine(const PathPoint& point, const PathPoint& start, const PathPoint& end) {
    const float dx = end[0] - start[0], dy = end[1] - start[1];
    if (dx == 0.0F && dy == 0.0F) return std::hypot(point[0] - start[0], point[1] - start[1]);
    return std::fabs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]) /
           std::hypot(dx, dy);
}

void flattenCubic(const PathPoint& start, const PathPoint& control1,
                  const PathPoint& control2, const PathPoint& end,
                  float tolerance, std::vector<PathPoint>& output, unsigned depth) {
    if (depth >= 12 || std::max(distanceToLine(control1, start, end),
                                distanceToLine(control2, start, end)) <= tolerance) {
        output.push_back(end);
        return;
    }
    const PathPoint a = midpoint(start, control1), b = midpoint(control1, control2);
    const PathPoint c = midpoint(control2, end), d = midpoint(a, b), e = midpoint(b, c);
    const PathPoint middle = midpoint(d, e);
    flattenCubic(start, a, d, middle, tolerance, output, depth + 1);
    flattenCubic(middle, e, c, end, tolerance, output, depth + 1);
}

std::vector<Contour> flatten(const std::vector<mgfx::ipc::PathSegment>& segments,
                             float tolerance) {
    std::vector<Contour> contours;
    std::vector<PathPoint> points;
    PathPoint current{0.0F, 0.0F};
    const auto finish = [&](bool closed) {
        if (points.size() > 1) {
            if (points.front() == points.back()) points.pop_back();
            if (points.size() > 1) contours.push_back({std::move(points), closed});
        }
        points.clear();
    };
    for (const mgfx::ipc::PathSegment& segment : segments) {
        switch (segment.verb) {
        case mgfx::ipc::PathVerb::moveTo:
            finish(false);
            current = {segment.values[0], segment.values[1]};
            points.push_back(current);
            break;
        case mgfx::ipc::PathVerb::lineTo:
            current = {segment.values[0], segment.values[1]};
            points.push_back(current);
            break;
        case mgfx::ipc::PathVerb::cubicTo: {
            const PathPoint end{segment.values[4], segment.values[5]};
            flattenCubic(current, {segment.values[0], segment.values[1]},
                         {segment.values[2], segment.values[3]}, end,
                         tolerance, points, 0);
            current = end;
            break;
        }
        case mgfx::ipc::PathVerb::close:
            finish(true);
            break;
        }
    }
    finish(false);
    return contours;
}

double signedArea(const std::vector<PathPoint>& points) {
    double area = 0.0;
    for (std::size_t index = 0; index < points.size(); ++index) {
        const PathPoint& current = points[index];
        const PathPoint& next = points[(index + 1) % points.size()];
        area += static_cast<double>(current[0]) * next[1] -
                static_cast<double>(next[0]) * current[1];
    }
    return area * 0.5;
}

bool pointInPolygon(const PathPoint& point, const std::vector<PathPoint>& polygon) {
    bool inside = false;
    for (std::size_t index = 0, previous = polygon.size() - 1; index < polygon.size();
         previous = index++) {
        const PathPoint& a = polygon[index];
        const PathPoint& b = polygon[previous];
        if ((a[1] > point[1]) != (b[1] > point[1]) &&
            point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) {
            inside = !inside;
        }
    }
    return inside;
}

struct ContourNode {
    std::vector<PathPoint> points;
    double area = 0.0;
    int parent = -1;
    int depth = 0;
    enum class Role { outer, hole, ignored } role = Role::ignored;
};

int depthOf(const std::vector<ContourNode>& nodes, int index) {
    return nodes[index].parent < 0 ? 0 : depthOf(nodes, nodes[index].parent) + 1;
}

int windingOutside(const std::vector<ContourNode>& nodes, int index) {
    int winding = 0;
    for (int parent = nodes[index].parent; parent >= 0; parent = nodes[parent].parent) {
        winding += nodes[parent].area > 0.0 ? 1 : -1;
    }
    return winding;
}

using FillGroup = std::vector<std::vector<PathPoint>>;

std::vector<FillGroup> fillGroups(const std::vector<Contour>& contours, FillRule fillRule) {
    std::vector<ContourNode> nodes;
    for (const Contour& contour : contours) {
        if (contour.closed && contour.points.size() > 2) {
            nodes.push_back({contour.points, signedArea(contour.points)});
        }
    }
    for (std::size_t index = 0; index < nodes.size(); ++index) {
        double parentArea = std::numeric_limits<double>::infinity();
        for (std::size_t candidate = 0; candidate < nodes.size(); ++candidate) {
            if (candidate == index) continue;
            const double area = std::fabs(nodes[candidate].area);
            if (area > std::fabs(nodes[index].area) && area < parentArea &&
                pointInPolygon(nodes[index].points.front(), nodes[candidate].points)) {
                nodes[index].parent = static_cast<int>(candidate);
                parentArea = area;
            }
        }
    }
    for (std::size_t index = 0; index < nodes.size(); ++index) {
        ContourNode& node = nodes[index];
        node.depth = depthOf(nodes, static_cast<int>(index));
        const int outsideWinding = windingOutside(nodes, static_cast<int>(index));
        const bool outsideFilled = fillRule == FillRule::evenodd
            ? node.depth % 2 == 1 : outsideWinding != 0;
        const int direction = node.area > 0.0 ? 1 : -1;
        const bool insideFilled = fillRule == FillRule::evenodd
            ? !outsideFilled : outsideWinding + direction != 0;
        node.role = !outsideFilled && insideFilled ? ContourNode::Role::outer :
                    outsideFilled && !insideFilled ? ContourNode::Role::hole :
                    ContourNode::Role::ignored;
    }
    std::vector<std::size_t> outers;
    for (std::size_t index = 0; index < nodes.size(); ++index) {
        if (nodes[index].role == ContourNode::Role::outer) outers.push_back(index);
    }
    std::vector<FillGroup> groups;
    for (const std::size_t outerIndex : outers) {
        FillGroup group{nodes[outerIndex].points};
        for (std::size_t index = 0; index < nodes.size(); ++index) {
            const ContourNode& hole = nodes[index];
            if (hole.role != ContourNode::Role::hole ||
                !pointInPolygon(hole.points.front(), nodes[outerIndex].points)) continue;
            bool belongsToNestedOuter = false;
            for (const std::size_t candidate : outers) {
                if (candidate != outerIndex &&
                    std::fabs(nodes[candidate].area) < std::fabs(nodes[outerIndex].area) &&
                    pointInPolygon(hole.points.front(), nodes[candidate].points)) {
                    belongsToNestedOuter = true;
                    break;
                }
            }
            if (!belongsToNestedOuter) group.push_back(hole.points);
        }
        groups.push_back(std::move(group));
    }
    return groups;
}

void appendFill(const std::vector<Contour>& contours, FillRule fillRule,
                std::vector<PathPoint>& triangles) {
    using Ring = std::vector<std::array<double, 2>>;
    using Polygon = std::vector<Ring>;
    for (const FillGroup& group : fillGroups(contours, fillRule)) {
        Polygon polygon;
        std::vector<PathPoint> flat;
        for (const std::vector<PathPoint>& contour : group) {
            Ring ring;
            for (const PathPoint& point : contour) {
                ring.push_back({point[0], point[1]});
                flat.push_back(point);
            }
            polygon.push_back(std::move(ring));
        }
        for (const std::uint32_t index : mapbox::earcut<std::uint32_t>(polygon)) {
            if (index < flat.size()) triangles.push_back(flat[index]);
        }
    }
}

void appendDisk(const PathPoint& center, float radius, std::vector<PathPoint>& triangles) {
    constexpr unsigned segments = 12;
    constexpr float pi = 3.14159265358979323846F;
    for (unsigned index = 0; index < segments; ++index) {
        const float first = static_cast<float>(index) / segments * 2.0F * pi;
        const float second = static_cast<float>(index + 1) / segments * 2.0F * pi;
        triangles.push_back(center);
        triangles.push_back({center[0] + std::cos(first) * radius,
                             center[1] + std::sin(first) * radius});
        triangles.push_back({center[0] + std::cos(second) * radius,
                             center[1] + std::sin(second) * radius});
    }
}

void appendStroke(const std::vector<Contour>& contours, float width,
                  LineCap lineCap, LineJoin lineJoin,
                  std::vector<PathPoint>& triangles) {
    const float half = std::max(0.0F, width) * 0.5F;
    if (half <= 0.0F) return;
    for (const Contour& contour : contours) {
        const std::size_t count = contour.points.size();
        const std::size_t segmentCount = contour.closed ? count : count - 1;
        for (std::size_t index = 0; index < segmentCount; ++index) {
            const PathPoint& start = contour.points[index];
            const PathPoint& end = contour.points[(index + 1) % count];
            const float dx = end[0] - start[0], dy = end[1] - start[1];
            const float length = std::hypot(dx, dy);
            if (length <= 0.0F) continue;
            const float nx = -dy / length * half, ny = dx / length * half;
            const PathPoint a{start[0] + nx, start[1] + ny};
            const PathPoint b{start[0] - nx, start[1] - ny};
            const PathPoint c{end[0] - nx, end[1] - ny};
            const PathPoint d{end[0] + nx, end[1] + ny};
            triangles.insert(triangles.end(), {a, b, c, a, c, d});
        }
        if (lineJoin == LineJoin::round) {
            const std::size_t first = contour.closed ? 0 : 1;
            const std::size_t last = contour.closed ? count : count - 1;
            for (std::size_t index = first; index < last; ++index) {
                appendDisk(contour.points[index], half, triangles);
            }
        }
        if (!contour.closed && lineCap == LineCap::round && count > 1) {
            appendDisk(contour.points.front(), half, triangles);
            appendDisk(contour.points.back(), half, triangles);
        }
    }
}

} // namespace

PathTriangles tessellatePath(const std::vector<mgfx::ipc::PathSegment>& segments,
                             bool fillEnabled, bool strokeEnabled, FillRule fillRule,
                             LineCap lineCap, LineJoin lineJoin,
                             float strokeWidth, float tolerance) {
    PathTriangles result;
    const std::vector<Contour> contours = flatten(segments, std::max(0.01F, tolerance));
    if (fillEnabled) appendFill(contours, fillRule, result.fill);
    if (strokeEnabled) appendStroke(contours, strokeWidth, lineCap, lineJoin, result.stroke);
    return result;
}

} // namespace gfx
