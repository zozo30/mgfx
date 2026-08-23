#include "VectorPath.hpp"

#include <mapbox/earcut.hpp>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <iterator>
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

PathPoint add(const PathPoint& a, const PathPoint& b) {
    return {a[0] + b[0], a[1] + b[1]};
}

PathPoint subtract(const PathPoint& a, const PathPoint& b) {
    return {a[0] - b[0], a[1] - b[1]};
}

PathPoint multiply(const PathPoint& point, float amount) {
    return {point[0] * amount, point[1] * amount};
}

float cross(const PathPoint& a, const PathPoint& b) {
    return a[0] * b[1] - a[1] * b[0];
}

PathPoint direction(const PathPoint& start, const PathPoint& end) {
    const PathPoint delta = subtract(end, start);
    const float length = std::hypot(delta[0], delta[1]);
    return length > 0.0F ? multiply(delta, 1.0F / length) : PathPoint{0.0F, 0.0F};
}

PathPoint normal(const PathPoint& direction, float side, float halfWidth) {
    return {-direction[1] * side * halfWidth, direction[0] * side * halfWidth};
}

void appendArc(const PathPoint& center, const PathPoint& from, const PathPoint& to,
               float sweepSign, std::vector<PathPoint>& points, bool includeEnd) {
    constexpr float pi = 3.14159265358979323846F;
    float start = std::atan2(from[1], from[0]);
    float end = std::atan2(to[1], to[0]);
    if (sweepSign > 0.0F) {
        while (end <= start) end += 2.0F * pi;
    } else {
        while (end >= start) end -= 2.0F * pi;
    }
    const float sweep = end - start;
    const unsigned segments = std::max(1U, static_cast<unsigned>(
        std::ceil(std::fabs(sweep) / (pi / 12.0F))));
    const float radius = std::hypot(from[0], from[1]);
    const unsigned last = includeEnd ? segments : segments - 1;
    for (unsigned index = 1; index <= last; ++index) {
        const float angle = start + sweep * static_cast<float>(index) / segments;
        points.push_back({center[0] + std::cos(angle) * radius,
                          center[1] + std::sin(angle) * radius});
    }
}

PathPoint offsetIntersection(const PathPoint& point, const PathPoint& previousDirection,
                             const PathPoint& nextDirection, float side, float halfWidth) {
    const PathPoint previousNormal = normal(previousDirection, side, 1.0F);
    const PathPoint nextNormal = normal(nextDirection, side, 1.0F);
    const PathPoint sum = add(previousNormal, nextNormal);
    const float sumLength = std::hypot(sum[0], sum[1]);
    if (sumLength <= 0.00001F) return add(point, multiply(nextNormal, halfWidth));
    const PathPoint miter = multiply(sum, 1.0F / sumLength);
    const float denominator = miter[0] * nextNormal[0] + miter[1] * nextNormal[1];
    if (std::fabs(denominator) <= 0.00001F) {
        return add(point, multiply(nextNormal, halfWidth));
    }
    return add(point, multiply(miter, halfWidth / denominator));
}

std::vector<PathPoint> offsetSide(const Contour& contour, float side, float halfWidth,
                                  LineJoin lineJoin, float miterLimit) {
    std::vector<PathPoint> result;
    const std::size_t count = contour.points.size();
    if (count < 2) return result;
    if (!contour.closed) {
        result.push_back(add(contour.points.front(),
            normal(direction(contour.points[0], contour.points[1]), side, halfWidth)));
    }
    const std::size_t first = contour.closed ? 0 : 1;
    const std::size_t last = contour.closed ? count : count - 1;
    for (std::size_t index = first; index < last; ++index) {
        const PathPoint& point = contour.points[index];
        const PathPoint previousDirection = direction(
            contour.points[(index + count - 1) % count], point);
        const PathPoint nextDirection = direction(point, contour.points[(index + 1) % count]);
        const float turn = cross(previousDirection, nextDirection);
        const PathPoint previousOffset = normal(previousDirection, side, halfWidth);
        const PathPoint nextOffset = normal(nextDirection, side, halfWidth);
        const bool outer = turn * side < 0.0F;
        if (outer) {
            result.push_back(add(point, previousOffset));
            if (lineJoin == LineJoin::round && std::fabs(turn) > 0.00001F) {
                appendArc(point, previousOffset, nextOffset, turn, result, true);
            } else if (lineJoin == LineJoin::miter) {
                const PathPoint intersection = offsetIntersection(
                    point, previousDirection, nextDirection, side, halfWidth);
                const PathPoint extension = subtract(intersection, point);
                if (std::hypot(extension[0], extension[1]) <= halfWidth * miterLimit) {
                    result.back() = intersection;
                } else {
                    result.push_back(add(point, nextOffset));
                }
            } else {
                result.push_back(add(point, nextOffset));
            }
        } else {
            result.push_back(offsetIntersection(point, previousDirection,
                                                nextDirection, side, halfWidth));
        }
    }
    if (!contour.closed) {
        result.push_back(add(contour.points.back(), normal(
            direction(contour.points[count - 2], contour.points.back()), side, halfWidth)));
    }
    return result;
}

void appendPolygon(const std::vector<std::vector<PathPoint>>& rings,
                   std::vector<PathPoint>& triangles) {
    using Ring = std::vector<std::array<double, 2>>;
    using Polygon = std::vector<Ring>;
    Polygon polygon;
    std::vector<PathPoint> flat;
    for (const std::vector<PathPoint>& points : rings) {
        Ring ring;
        for (const PathPoint& point : points) {
            ring.push_back({point[0], point[1]});
            flat.push_back(point);
        }
        polygon.push_back(std::move(ring));
    }
    for (const std::uint32_t index : mapbox::earcut<std::uint32_t>(polygon)) {
        if (index < flat.size()) triangles.push_back(flat[index]);
    }
}

void appendStroke(const std::vector<Contour>& contours, float width,
                  LineCap lineCap, LineJoin lineJoin,
                  float miterLimit, std::vector<PathPoint>& triangles) {
    const float half = std::max(0.0F, width) * 0.5F;
    if (half <= 0.0F) return;
    for (const Contour& contour : contours) {
        std::vector<PathPoint> left = offsetSide(contour, 1.0F, half, lineJoin, miterLimit);
        std::vector<PathPoint> right = offsetSide(contour, -1.0F, half, lineJoin, miterLimit);
        if (left.size() < 2 || right.size() < 2) continue;
        if (contour.closed) {
            const bool leftIsOuter = signedArea(contour.points) < 0.0;
            appendPolygon(leftIsOuter
                ? std::vector<std::vector<PathPoint>>{left, right}
                : std::vector<std::vector<PathPoint>>{right, left}, triangles);
            continue;
        }
        if (lineCap == LineCap::square) {
            const PathPoint startExtension = multiply(
                direction(contour.points[0], contour.points[1]), half);
            const PathPoint endExtension = multiply(direction(
                contour.points[contour.points.size() - 2], contour.points.back()), half);
            left.front() = subtract(left.front(), startExtension);
            right.front() = subtract(right.front(), startExtension);
            left.back() = add(left.back(), endExtension);
            right.back() = add(right.back(), endExtension);
        }
        std::vector<PathPoint> outline = left;
        if (lineCap == LineCap::round) {
            appendArc(contour.points.back(), subtract(left.back(), contour.points.back()),
                      subtract(right.back(), contour.points.back()), -1.0F, outline, false);
        }
        outline.insert(outline.end(), right.rbegin(), right.rend());
        if (lineCap == LineCap::round) {
            appendArc(contour.points.front(), subtract(right.front(), contour.points.front()),
                      subtract(left.front(), contour.points.front()), -1.0F, outline, false);
        }
        appendPolygon({outline}, triangles);
    }
}

PathPoint interpolate(const PathPoint& start, const PathPoint& end, float amount) {
    return {start[0] + (end[0] - start[0]) * amount,
            start[1] + (end[1] - start[1]) * amount};
}

std::vector<Contour> dashContours(const std::vector<Contour>& contours,
                                  const std::vector<float>& pattern, float offset) {
    std::vector<Contour> result;
    if (pattern.empty()) return contours;
    float period = 0.0F;
    for (float length : pattern) period += length;
    if (period <= 0.0F) return contours;
    for (const Contour& contour : contours) {
        if (contour.points.size() < 2) continue;
        float phase = std::fmod(offset, period);
        if (phase < 0.0F) phase += period;
        std::size_t patternIndex = 0;
        while (patternIndex + 1 < pattern.size() && phase >= pattern[patternIndex]) {
            phase -= pattern[patternIndex++];
        }
        bool drawing = patternIndex % 2 == 0;
        float remaining = pattern[patternIndex] - phase;
        std::vector<Contour> pieces;
        std::vector<PathPoint> active;
        const std::size_t segmentCount = contour.closed
            ? contour.points.size() : contour.points.size() - 1;
        for (std::size_t index = 0; index < segmentCount; ++index) {
            const PathPoint& start = contour.points[index];
            const PathPoint& end = contour.points[(index + 1) % contour.points.size()];
            const float length = std::hypot(end[0] - start[0], end[1] - start[1]);
            if (length <= 0.00001F) continue;
            float consumed = 0.0F;
            while (consumed < length - 0.00001F) {
                const float amount = std::min(remaining, length - consumed);
                const PathPoint from = interpolate(start, end, consumed / length);
                const PathPoint to = interpolate(start, end, (consumed + amount) / length);
                if (drawing) {
                    if (active.empty()) active.push_back(from);
                    if (active.back() != to) active.push_back(to);
                }
                consumed += amount;
                remaining -= amount;
                if (remaining <= 0.00001F) {
                    if (drawing && active.size() > 1) pieces.push_back({std::move(active), false});
                    active.clear();
                    patternIndex = (patternIndex + 1) % pattern.size();
                    drawing = patternIndex % 2 == 0;
                    remaining = pattern[patternIndex];
                }
            }
        }
        if (drawing && active.size() > 1) pieces.push_back({std::move(active), false});
        if (contour.closed && pieces.size() > 1 &&
            pieces.front().points.front() == contour.points.front() &&
            pieces.back().points.back() == contour.points.front()) {
            std::vector<PathPoint> joined = std::move(pieces.back().points);
            joined.insert(joined.end(), std::next(pieces.front().points.begin()),
                          pieces.front().points.end());
            pieces.front().points = std::move(joined);
            pieces.pop_back();
        }
        result.insert(result.end(), std::make_move_iterator(pieces.begin()),
                      std::make_move_iterator(pieces.end()));
    }
    return result;
}

} // namespace

PathTriangles tessellatePath(const std::vector<mgfx::ipc::PathSegment>& segments,
                             bool fillEnabled, bool strokeEnabled, FillRule fillRule,
                             LineCap lineCap, LineJoin lineJoin,
                             float strokeWidth, float tolerance,
                             float dashLength, float gapLength, float dashOffset,
                             float miterLimit, const std::vector<float>& dashPattern) {
    PathTriangles result;
    const std::vector<Contour> contours = flatten(segments, std::max(0.01F, tolerance));
    if (fillEnabled) appendFill(contours, fillRule, result.fill);
    if (strokeEnabled) appendStroke(
        !dashPattern.empty() ? dashContours(contours, dashPattern, dashOffset) :
        dashLength > 0.0F && gapLength > 0.0F
            ? dashContours(contours, {dashLength, gapLength}, dashOffset) : contours,
        strokeWidth, lineCap, lineJoin, miterLimit, result.stroke);
    return result;
}

} // namespace gfx
