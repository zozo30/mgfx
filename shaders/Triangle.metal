#include <metal_stdlib>

using namespace metal;

struct VertexOut {
    float4 position [[position]];
    float4 color;
};

struct Vertex {
    packed_float2 position;
    packed_float4 color;
};

vertex VertexOut vertexMain(const device Vertex* vertices [[buffer(0)]],
                            uint vertexId [[vertex_id]]) {
    const float4 color = vertices[vertexId].color;
    return {float4(vertices[vertexId].position, 0.0, 1.0),
            float4(color.rgb * color.a, color.a)};
}

fragment float4 fragmentMain(VertexOut in [[stage_in]]) {
    return in.color;
}

struct ImageVertex {
    packed_float2 position;
    packed_float2 uv;
    packed_float4 tint;
};

struct ImageVertexOut {
    float4 position [[position]];
    float2 uv;
    float4 tint;
};

vertex ImageVertexOut imageVertexMain(const device ImageVertex* vertices [[buffer(0)]],
                                      uint vertexId [[vertex_id]]) {
    const ImageVertex value = vertices[vertexId];
    return {float4(value.position, 0.0, 1.0), value.uv, value.tint};
}

fragment float4 imageFragmentMain(ImageVertexOut in [[stage_in]],
                                  texture2d<float> image [[texture(0)]]) {
    constexpr sampler imageSampler(coord::normalized, address::clamp_to_edge, filter::linear);
    const float4 sampled = image.sample(imageSampler, in.uv);
    return float4(sampled.rgb * in.tint.rgb * in.tint.a, sampled.a * in.tint.a);
}

struct ImageSurfaceVertex {
    packed_float2 position;
    packed_float2 uv;
    packed_float2 local;
    packed_float2 size;
    float cornerRadius;
    float sampling;
    packed_float4 tint;
};

struct ImageSurfaceVertexOut {
    float4 position [[position]];
    float2 uv;
    float2 local;
    float2 size;
    float cornerRadius;
    float sampling;
    float4 tint;
};

vertex ImageSurfaceVertexOut imageSurfaceVertexMain(
    const device ImageSurfaceVertex* vertices [[buffer(0)]], uint vertexId [[vertex_id]]) {
    const ImageSurfaceVertex value = vertices[vertexId];
    return {float4(value.position, 0.0, 1.0), value.uv, value.local, value.size,
            value.cornerRadius, value.sampling, value.tint};
}

fragment float4 imageSurfaceFragmentMain(ImageSurfaceVertexOut in [[stage_in]],
                                         texture2d<float> image [[texture(0)]]) {
    constexpr sampler linearSampler(coord::normalized, address::clamp_to_edge, filter::linear);
    constexpr sampler nearestSampler(coord::normalized, address::clamp_to_edge, filter::nearest);
    const float4 sampled = in.sampling > 0.5
        ? image.sample(nearestSampler, in.uv) : image.sample(linearSampler, in.uv);
    const float2 halfSize = in.size * 0.5;
    const float radius = min(in.cornerRadius, min(halfSize.x, halfSize.y));
    const float2 q = abs(in.local - halfSize) - halfSize + radius;
    const float edge = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    const float coverage = 1.0 - smoothstep(0.0, max(fwidth(edge), 0.75), edge);
    const float alpha = sampled.a * in.tint.a * coverage;
    return float4(sampled.rgb * in.tint.rgb * in.tint.a * coverage, alpha);
}

struct ShadowVertex {
    packed_float2 position;
    packed_float2 local;
    packed_float2 halfSize;
    float radius;
    float blur;
    packed_float4 color;
};

struct ShadowVertexOut {
    float4 position [[position]];
    float2 local;
    float2 halfSize;
    float radius;
    float blur;
    float4 color;
};

vertex ShadowVertexOut shadowVertexMain(const device ShadowVertex* vertices [[buffer(0)]],
                                        uint vertexId [[vertex_id]]) {
    const ShadowVertex value = vertices[vertexId];
    return {float4(value.position, 0.0, 1.0), value.local, value.halfSize,
            value.radius, value.blur, value.color};
}

fragment float4 shadowFragmentMain(ShadowVertexOut in [[stage_in]]) {
    const float radius = min(in.radius, min(in.halfSize.x, in.halfSize.y));
    const float2 q = abs(in.local) - in.halfSize + radius;
    const float distance = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    const float coverage = in.blur > 0.001
        ? 1.0 - smoothstep(-in.blur, in.blur, distance)
        : (distance <= 0.0 ? 1.0 : 0.0);
    const float alpha = in.color.a * coverage;
    return float4(in.color.rgb * alpha, alpha);
}

struct RadialVertex {
    packed_float2 position;
    packed_float2 local;
    packed_float2 size;
    packed_float2 center;
    float radius;
    float cornerRadius;
    packed_float4 innerColor;
    packed_float4 outerColor;
};

struct RadialVertexOut {
    float4 position [[position]];
    float2 local;
    float2 size;
    float2 center;
    float radius;
    float cornerRadius;
    float4 innerColor;
    float4 outerColor;
};

vertex RadialVertexOut radialVertexMain(const device RadialVertex* vertices [[buffer(0)]],
                                        uint vertexId [[vertex_id]]) {
    const RadialVertex value = vertices[vertexId];
    return {float4(value.position, 0.0, 1.0), value.local, value.size, value.center,
            value.radius, value.cornerRadius, value.innerColor, value.outerColor};
}

fragment float4 radialFragmentMain(RadialVertexOut in [[stage_in]]) {
    const float amount = clamp(distance(in.local, in.center) / in.radius, 0.0, 1.0);
    const float4 color = mix(in.innerColor, in.outerColor, amount);
    const float2 halfSize = in.size * 0.5;
    const float radius = min(in.cornerRadius, min(halfSize.x, halfSize.y));
    const float2 q = abs(in.local - halfSize) - halfSize + radius;
    const float edge = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    const float coverage = 1.0 - smoothstep(0.0, max(fwidth(edge), 0.75), edge);
    const float alpha = color.a * coverage;
    return float4(color.rgb * alpha, alpha);
}

struct LinearGradientVertex {
    packed_float2 position;
    packed_float2 local;
    packed_float2 size;
    float cornerRadius;
    float direction;
    packed_float4 startColor;
    packed_float4 endColor;
};

struct LinearGradientVertexOut {
    float4 position [[position]];
    float2 local;
    float2 size;
    float cornerRadius;
    float direction;
    float4 startColor;
    float4 endColor;
};

vertex LinearGradientVertexOut linearGradientVertexMain(
    const device LinearGradientVertex* vertices [[buffer(0)]], uint vertexId [[vertex_id]]) {
    const LinearGradientVertex value = vertices[vertexId];
    return {float4(value.position, 0.0, 1.0), value.local, value.size,
            value.cornerRadius, value.direction, value.startColor, value.endColor};
}

fragment float4 linearGradientFragmentMain(LinearGradientVertexOut in [[stage_in]]) {
    const float2 normalized = in.local / max(in.size, float2(0.0001));
    const float amount = clamp(in.direction < 0.5 ? normalized.x :
        (in.direction < 1.5 ? normalized.y : (normalized.x + normalized.y) * 0.5), 0.0, 1.0);
    const float4 color = mix(in.startColor, in.endColor, amount);
    const float2 halfSize = in.size * 0.5;
    const float radius = min(in.cornerRadius, min(halfSize.x, halfSize.y));
    const float2 q = abs(in.local - halfSize) - halfSize + radius;
    const float edge = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    const float coverage = 1.0 - smoothstep(0.0, max(fwidth(edge), 0.75), edge);
    const float alpha = color.a * coverage;
    return float4(color.rgb * alpha, alpha);
}

struct ConicGradientVertex {
    packed_float2 position;
    packed_float2 local;
    packed_float2 size;
    packed_float2 center;
    float rotation;
    float cornerRadius;
    packed_float4 startColor;
    packed_float4 middleColor;
    packed_float4 endColor;
};

struct ConicGradientVertexOut {
    float4 position [[position]];
    float2 local;
    float2 size;
    float2 center;
    float rotation;
    float cornerRadius;
    float4 startColor;
    float4 middleColor;
    float4 endColor;
};

vertex ConicGradientVertexOut conicGradientVertexMain(
    const device ConicGradientVertex* vertices [[buffer(0)]], uint vertexId [[vertex_id]]) {
    const ConicGradientVertex value = vertices[vertexId];
    return {float4(value.position, 0.0, 1.0), value.local, value.size, value.center,
            value.rotation, value.cornerRadius, value.startColor,
            value.middleColor, value.endColor};
}

fragment float4 conicGradientFragmentMain(ConicGradientVertexOut in [[stage_in]]) {
    constexpr float tau = 6.28318530718;
    const float angle = atan2(in.local.y - in.center.y, in.local.x - in.center.x);
    const float amount = fract((angle + in.rotation) / tau + 1.0);
    const float4 color = amount < 0.5
        ? mix(in.startColor, in.middleColor, amount * 2.0)
        : mix(in.middleColor, in.endColor, (amount - 0.5) * 2.0);
    const float2 halfSize = in.size * 0.5;
    const float radius = min(in.cornerRadius, min(halfSize.x, halfSize.y));
    const float2 q = abs(in.local - halfSize) - halfSize + radius;
    const float edge = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    const float coverage = 1.0 - smoothstep(0.0, max(fwidth(edge), 0.75), edge);
    const float alpha = color.a * coverage;
    return float4(color.rgb * alpha, alpha);
}

struct RoundedRectVertex {
    packed_float2 position;
    packed_float2 local;
    packed_float2 size;
    float radius;
    float borderWidth;
    packed_float4 fillColor;
    packed_float4 borderColor;
};

struct RoundedRectVertexOut {
    float4 position [[position]];
    float2 local;
    float2 size;
    float radius;
    float borderWidth;
    float4 fillColor;
    float4 borderColor;
};

vertex RoundedRectVertexOut roundedRectVertexMain(
    const device RoundedRectVertex* vertices [[buffer(0)]], uint vertexId [[vertex_id]]) {
    const RoundedRectVertex value = vertices[vertexId];
    return {float4(value.position, 0.0, 1.0), value.local, value.size,
            value.radius, value.borderWidth, value.fillColor, value.borderColor};
}

fragment float4 roundedRectFragmentMain(RoundedRectVertexOut in [[stage_in]]) {
    const float2 halfSize = in.size * 0.5;
    const float radius = min(in.radius, min(halfSize.x, halfSize.y));
    const float2 centered = in.local - halfSize;
    const float2 outerQ = abs(centered) - halfSize + radius;
    const float outerDistance = length(max(outerQ, 0.0)) +
        min(max(outerQ.x, outerQ.y), 0.0) - radius;
    const float outerAA = max(fwidth(outerDistance), 0.75);
    const float outerCoverage = 1.0 - smoothstep(0.0, outerAA, outerDistance);

    const float border = min(in.borderWidth, min(halfSize.x, halfSize.y));
    const float2 innerHalf = max(halfSize - border, 0.0);
    const float innerRadius = max(radius - border, 0.0);
    const float2 innerQ = abs(centered) - innerHalf + innerRadius;
    const float innerDistance = length(max(innerQ, 0.0)) +
        min(max(innerQ.x, innerQ.y), 0.0) - innerRadius;
    const float innerAA = max(fwidth(innerDistance), 0.75);
    const float innerCoverage = border > 0.0
        ? 1.0 - smoothstep(0.0, innerAA, innerDistance) : outerCoverage;
    const float borderCoverage = max(0.0, outerCoverage - innerCoverage);
    const float4 fill = float4(in.fillColor.rgb * in.fillColor.a, in.fillColor.a) * innerCoverage;
    const float4 stroke = float4(in.borderColor.rgb * in.borderColor.a,
                                 in.borderColor.a) * borderCoverage;
    return fill + stroke;
}

struct CircleVertex {
    packed_float2 position;
    packed_float2 local;
    packed_float2 size;
    float borderWidth;
    packed_float4 fillColor;
    packed_float4 borderColor;
};

struct CircleVertexOut {
    float4 position [[position]];
    float2 local;
    float2 size;
    float borderWidth;
    float4 fillColor;
    float4 borderColor;
};

vertex CircleVertexOut circleVertexMain(const device CircleVertex* vertices [[buffer(0)]],
                                        uint vertexId [[vertex_id]]) {
    const CircleVertex value = vertices[vertexId];
    return {float4(value.position, 0.0, 1.0), value.local, value.size,
            value.borderWidth, value.fillColor, value.borderColor};
}

fragment float4 circleFragmentMain(CircleVertexOut in [[stage_in]]) {
    const float radius = min(in.size.x, in.size.y) * 0.5;
    const float distance = length(in.local - in.size * 0.5);
    const float outerEdge = distance - radius;
    const float outerAA = max(fwidth(outerEdge), 0.75);
    const float outerCoverage = 1.0 - smoothstep(0.0, outerAA, outerEdge);
    const float border = min(in.borderWidth, radius);
    const float innerEdge = distance - max(0.0, radius - border);
    const float innerAA = max(fwidth(innerEdge), 0.75);
    const float innerCoverage = border > 0.0
        ? 1.0 - smoothstep(0.0, innerAA, innerEdge) : outerCoverage;
    const float borderCoverage = max(0.0, outerCoverage - innerCoverage);
    const float4 fill = float4(in.fillColor.rgb * in.fillColor.a, in.fillColor.a) * innerCoverage;
    const float4 stroke = float4(in.borderColor.rgb * in.borderColor.a,
                                 in.borderColor.a) * borderCoverage;
    return fill + stroke;
}

struct PatternVertex {
    packed_float2 position;
    packed_float2 local;
    packed_float2 size;
    float stripeWidth;
    float gap;
    float offset;
    float backward;
    packed_float4 color;
};

struct PatternVertexOut {
    float4 position [[position]];
    float2 local;
    float2 size;
    float stripeWidth;
    float gap;
    float offset;
    float backward;
    float4 color;
};

vertex PatternVertexOut patternVertexMain(const device PatternVertex* vertices [[buffer(0)]],
                                          uint vertexId [[vertex_id]]) {
    const PatternVertex value = vertices[vertexId];
    return {float4(value.position, 0.0, 1.0), value.local, value.size,
            value.stripeWidth, value.gap, value.offset, value.backward, value.color};
}

fragment float4 patternFragmentMain(PatternVertexOut in [[stage_in]]) {
    const float coordinate = in.backward > 0.5
        ? in.local.x - in.local.y + in.size.y : in.local.x + in.local.y;
    const float period = in.stripeWidth + in.gap;
    const float distanceToCenter = abs(fract((coordinate + in.offset) / period) - 0.5) * period;
    const float aa = max(fwidth(coordinate), 0.75);
    const float coverage = 1.0 - smoothstep(in.stripeWidth * 0.5 - aa,
                                            in.stripeWidth * 0.5 + aa,
                                            distanceToCenter);
    const float alpha = in.color.a * coverage;
    return float4(in.color.rgb * alpha, alpha);
}

struct DotGridVertex {
    packed_float2 position;
    packed_float2 local;
    packed_float2 size;
    uint rows;
    uint columns;
    uint filledMask;
    uint activeIndex;
    float inset;
    float radius;
    float borderWidth;
    packed_float4 fillColor;
    packed_float4 ringColor;
    packed_float4 highlightColor;
};

struct DotGridVertexOut {
    float4 position [[position]];
    float2 local;
    float2 size;
    uint rows [[flat]];
    uint columns [[flat]];
    uint filledMask [[flat]];
    uint activeIndex [[flat]];
    float inset;
    float radius;
    float borderWidth;
    float4 fillColor;
    float4 ringColor;
    float4 highlightColor;
};

vertex DotGridVertexOut dotGridVertexMain(const device DotGridVertex* vertices [[buffer(0)]],
                                          uint vertexId [[vertex_id]]) {
    const DotGridVertex value = vertices[vertexId];
    return {float4(value.position, 0.0, 1.0), value.local, value.size,
            value.rows, value.columns, value.filledMask, value.activeIndex,
            value.inset, value.radius, value.borderWidth,
            value.fillColor, value.ringColor, value.highlightColor};
}

fragment float4 dotGridFragmentMain(DotGridVertexOut in [[stage_in]]) {
    const float2 available = in.size - in.inset * 2.0;
    const float2 cellSize = available / float2(in.columns, in.rows);
    const float2 relative = in.local - in.inset;
    if (any(relative < 0.0) || any(relative >= available)) return 0.0;
    const uint2 cell = uint2(floor(relative / cellSize));
    const uint index = cell.y * in.columns + cell.x;
    const float2 center = in.inset + (float2(cell) + 0.5) * cellSize;
    const float edge = distance(in.local, center) - in.radius;
    const float aa = max(fwidth(edge), 0.75);
    const float outerCoverage = 1.0 - smoothstep(0.0, aa, edge);
    const bool active = index == in.activeIndex;
    const bool filled = active || ((in.filledMask & (1u << index)) != 0u);
    float coverage = outerCoverage;
    float4 color = active ? in.highlightColor : (filled ? in.fillColor : in.ringColor);
    if (!filled) {
        const float innerEdge = distance(in.local, center) - max(0.0, in.radius - in.borderWidth);
        const float innerCoverage = 1.0 - smoothstep(0.0, aa, innerEdge);
        coverage = max(0.0, outerCoverage - innerCoverage);
    }
    const float alpha = color.a * coverage;
    return float4(color.rgb * alpha, alpha);
}

struct WaveDotsVertex {
    packed_float2 position;
    packed_float2 local;
    packed_float2 size;
    uint count;
    float inset;
    float minimumRadius;
    float maximumRadius;
    float phase;
    float frequency;
    float borderWidth;
    packed_float4 troughStartColor;
    packed_float4 troughEndColor;
    packed_float4 crestStartColor;
    packed_float4 crestEndColor;
    packed_float4 borderColor;
};

struct WaveDotsVertexOut {
    float4 position [[position]];
    float2 local;
    float2 size;
    uint count [[flat]];
    float inset;
    float minimumRadius;
    float maximumRadius;
    float phase;
    float frequency;
    float borderWidth;
    float4 troughStartColor;
    float4 troughEndColor;
    float4 crestStartColor;
    float4 crestEndColor;
    float4 borderColor;
};

vertex WaveDotsVertexOut waveDotsVertexMain(
    const device WaveDotsVertex* vertices [[buffer(0)]], uint vertexId [[vertex_id]]) {
    const WaveDotsVertex value = vertices[vertexId];
    return {float4(value.position, 0.0, 1.0), value.local, value.size, value.count,
            value.inset, value.minimumRadius, value.maximumRadius, value.phase,
            value.frequency, value.borderWidth, value.troughStartColor,
            value.troughEndColor, value.crestStartColor, value.crestEndColor,
            value.borderColor};
}

fragment float4 waveDotsFragmentMain(WaveDotsVertexOut in [[stage_in]]) {
    const float availableWidth = in.size.x - in.inset * 2.0;
    const float relativeX = in.local.x - in.inset;
    if (relativeX < 0.0 || relativeX >= availableWidth) return float4(0.0);
    const float cellWidth = availableWidth / float(in.count);
    const uint index = min(uint(floor(relativeX / cellWidth)), in.count - 1u);
    const float wave = (sin(in.phase + float(index) * in.frequency) + 1.0) * 0.5;
    const float requestedRadius = mix(in.minimumRadius, in.maximumRadius, wave);
    const float radius = min(requestedRadius,
        min(cellWidth * 0.48, max(0.0, in.size.y * 0.5 - in.inset)));
    const float2 center = float2(in.inset + (float(index) + 0.5) * cellWidth,
                                 in.size.y * 0.5);
    const float2 delta = in.local - center;
    const float edge = length(delta) - radius;
    const float aa = max(fwidth(edge), 0.75);
    const float outerCoverage = 1.0 - smoothstep(0.0, aa, edge);
    const float innerRadius = max(0.0, radius - in.borderWidth);
    const float innerEdge = length(delta) - innerRadius;
    const float innerCoverage = in.borderWidth > 0.0
        ? 1.0 - smoothstep(0.0, aa, innerEdge) : outerCoverage;
    const float amount = clamp(0.5 + (delta.x + delta.y) / max(radius * 4.0, 0.001), 0.0, 1.0);
    const float4 startColor = mix(in.troughStartColor, in.crestStartColor, wave);
    const float4 endColor = mix(in.troughEndColor, in.crestEndColor, wave);
    const float4 fillColor = mix(startColor, endColor, amount);
    const float4 fill = float4(fillColor.rgb * fillColor.a, fillColor.a) * innerCoverage;
    const float borderCoverage = max(0.0, outerCoverage - innerCoverage);
    const float4 border = float4(in.borderColor.rgb * in.borderColor.a,
                                 in.borderColor.a) * borderCoverage;
    return fill + border;
}
