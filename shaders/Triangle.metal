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

struct RadialPathVertex {
    packed_float2 position;
    packed_float2 source;
};

struct RadialPathVertexOut {
    float4 position [[position]];
    float2 source;
};

struct RadialPathUniforms {
    packed_float2 center;
    packed_float2 axisX;
    packed_float2 axisY;
    packed_float2 focal;
    float radiusOrRotation;
    uint stopCount;
    uint spread;
    uint mode;
    packed_float4 offsets[2];
    packed_float4 colors[8];
};

vertex RadialPathVertexOut radialPathVertexMain(
    const device RadialPathVertex* vertices [[buffer(0)]], uint vertexId [[vertex_id]]) {
    const RadialPathVertex value = vertices[vertexId];
    return {float4(value.position, 0.0, 1.0), value.source};
}

fragment float4 radialPathFragmentMain(RadialPathVertexOut in [[stage_in]],
                                       constant RadialPathUniforms& gradient [[buffer(0)]]) {
    const float2 delta = in.source - gradient.center;
    constexpr float tau = 6.28318530718;
    float rawAmount;
    if (gradient.mode == 1) {
        rawAmount = fract((atan2(delta.y, delta.x) + gradient.radiusOrRotation) / tau + 1.0);
    } else if (gradient.mode == 2) {
        const float lengthSquared = dot(gradient.axisX, gradient.axisX);
        rawAmount = lengthSquared > 0.000001 ? dot(delta, gradient.axisX) / lengthSquared : 0.0;
    } else {
        const float determinant = gradient.axisX.x * gradient.axisY.y -
                                  gradient.axisX.y * gradient.axisY.x;
        const float2 radial = abs(determinant) > 0.000001
            ? float2((delta.x * gradient.axisY.y - delta.y * gradient.axisY.x) / determinant,
                     (gradient.axisX.x * delta.y - gradient.axisX.y * delta.x) / determinant)
            : float2(1.0);
        const float2 focalDelta = radial - gradient.focal;
        const float radiusDelta = 1.0 - gradient.radiusOrRotation;
        const float a = dot(gradient.focal, gradient.focal) - radiusDelta * radiusDelta;
        const float b = 2.0 * (dot(focalDelta, gradient.focal) -
                               gradient.radiusOrRotation * radiusDelta);
        const float c = dot(focalDelta, focalDelta) -
                        gradient.radiusOrRotation * gradient.radiusOrRotation;
        const float discriminant = max(b * b - 4.0 * a * c, 0.0);
        const float solvedAmount = abs(a) > 0.000001 ?
            (-b - sqrt(discriminant)) / (2.0 * a) :
            abs(b) > 0.000001 ? -c / b : 0.0;
        rawAmount = c <= 0.0 ? 0.0 : max(solvedAmount, 0.0);
    }
    const float repeated = rawAmount - floor(rawAmount);
    const float reflectedCycle = rawAmount - floor(rawAmount * 0.5) * 2.0;
    const float amount = gradient.spread == 1 ? repeated : gradient.spread == 2 ?
        (reflectedCycle <= 1.0 ? reflectedCycle : 2.0 - reflectedCycle) :
        clamp(rawAmount, 0.0, 1.0);
    float4 color = gradient.colors[0];
    if (amount >= gradient.offsets[(gradient.stopCount - 1) / 4][(gradient.stopCount - 1) % 4]) {
        color = gradient.colors[gradient.stopCount - 1];
    } else if (amount > gradient.offsets[0][0]) {
        for (uint index = 1; index < 8 && index < gradient.stopCount; ++index) {
            const float nextOffset = gradient.offsets[index / 4][index % 4];
            if (amount < nextOffset) {
                const float previousOffset = gradient.offsets[(index - 1) / 4][(index - 1) % 4];
                const float width = nextOffset - previousOffset;
                const float local = width > 0.000001 ?
                    clamp((amount - previousOffset) / width, 0.0, 1.0) : 1.0;
                color = mix(gradient.colors[index - 1], gradient.colors[index], local);
                break;
            }
        }
    }
    return float4(color.rgb * color.a, color.a);
}

struct PathTextureUniforms {
    packed_float2 origin;
    packed_float2 size;
    packed_float2 uvOrigin;
    packed_float2 uvSize;
    packed_float4 tint;
    uint sampling;
    uint repeatX;
    uint repeatY;
    uint reserved;
};

fragment float4 pathTextureFragmentMain(RadialPathVertexOut in [[stage_in]],
                                        constant PathTextureUniforms& paint [[buffer(0)]],
                                        texture2d<float> image [[texture(0)]]) {
    constexpr sampler linearSampler(coord::normalized, address::clamp_to_edge, filter::linear);
    constexpr sampler nearestSampler(coord::normalized, address::clamp_to_edge, filter::nearest);
    float2 tile = (in.source - paint.origin) / paint.size;
    tile.x = paint.repeatX != 0 ? fract(tile.x) : clamp(tile.x, 0.0, 1.0);
    tile.y = paint.repeatY != 0 ? fract(tile.y) : clamp(tile.y, 0.0, 1.0);
    const float2 uv = paint.uvOrigin + tile * paint.uvSize;
    const float4 sampled = paint.sampling != 0
        ? image.sample(nearestSampler, uv) : image.sample(linearSampler, uv);
    return float4(sampled.rgb * paint.tint.rgb * paint.tint.a,
                  sampled.a * paint.tint.a);
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
    float repeatX;
    float repeatY;
    packed_float4 tint;
};

struct ImageSurfaceVertexOut {
    float4 position [[position]];
    float2 uv;
    float2 local;
    float2 size;
    float cornerRadius;
    float sampling;
    float2 repeat;
    float4 tint;
};

vertex ImageSurfaceVertexOut imageSurfaceVertexMain(
    const device ImageSurfaceVertex* vertices [[buffer(0)]], uint vertexId [[vertex_id]]) {
    const ImageSurfaceVertex value = vertices[vertexId];
    return {float4(value.position, 0.0, 1.0), value.uv, value.local, value.size,
            value.cornerRadius, value.sampling, float2(value.repeatX, value.repeatY), value.tint};
}

struct ImageEffectsUniforms {
    packed_float4 color;
    packed_float4 sampling;
};

fragment float4 imageSurfaceFragmentMain(ImageSurfaceVertexOut in [[stage_in]],
                                         constant ImageEffectsUniforms& effects [[buffer(0)]],
                                         texture2d<float> image [[texture(0)]]) {
    constexpr sampler linearClamp(coord::normalized, address::clamp_to_edge, filter::linear);
    constexpr sampler nearestClamp(coord::normalized, address::clamp_to_edge, filter::nearest);
    constexpr sampler linearRepeat(coord::normalized, address::repeat, filter::linear);
    constexpr sampler nearestRepeat(coord::normalized, address::repeat, filter::nearest);
    float2 sampleUv = in.uv;
    const bool repeats = in.repeat.x > 0.5 || in.repeat.y > 0.5;
    const float2 halfTexel = 0.5 / float2(image.get_width(), image.get_height());
    if (repeats && in.repeat.x < 0.5)
        sampleUv.x = clamp(sampleUv.x, halfTexel.x, 1.0 - halfTexel.x);
    if (repeats && in.repeat.y < 0.5)
        sampleUv.y = clamp(sampleUv.y, halfTexel.y, 1.0 - halfTexel.y);
    float4 sampled = in.sampling > 0.5
        ? (repeats ? image.sample(nearestRepeat, sampleUv) : image.sample(nearestClamp, sampleUv))
        : (repeats ? image.sample(linearRepeat, sampleUv) : image.sample(linearClamp, sampleUv));
    if (effects.sampling.x > 0.001) {
        sampled = float4(0.0);
        const float weights[3] = {1.0, 2.0, 1.0};
        const float2 step = effects.sampling.x /
            float2(image.get_width(), image.get_height());
        for (int y = -1; y <= 1; ++y) {
            for (int x = -1; x <= 1; ++x) {
                float2 tapUv = sampleUv + float2(x, y) * step;
                if (in.repeat.x < 0.5)
                    tapUv.x = clamp(tapUv.x, halfTexel.x, 1.0 - halfTexel.x);
                if (in.repeat.y < 0.5)
                    tapUv.y = clamp(tapUv.y, halfTexel.y, 1.0 - halfTexel.y);
                const float4 tap = in.sampling > 0.5
                    ? (repeats ? image.sample(nearestRepeat, tapUv)
                               : image.sample(nearestClamp, tapUv))
                    : (repeats ? image.sample(linearRepeat, tapUv)
                               : image.sample(linearClamp, tapUv));
                sampled += tap * (weights[x + 1] * weights[y + 1] / 16.0);
            }
        }
    }
    const float2 halfSize = in.size * 0.5;
    const float radius = min(in.cornerRadius, min(halfSize.x, halfSize.y));
    const float2 q = abs(in.local - halfSize) - halfSize + radius;
    const float edge = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    const float coverage = 1.0 - smoothstep(0.0, max(fwidth(edge), 0.75), edge);
    float3 rgb = sampled.rgb;
    const float luminance = dot(rgb, float3(0.2126, 0.7152, 0.0722));
    rgb = mix(float3(luminance), rgb, effects.color.x);
    rgb = (rgb - 0.5) * effects.color.y + 0.5 + effects.color.z;
    const float hue = effects.color.w;
    const float3 axis = normalize(float3(1.0));
    rgb = rgb * cos(hue) + cross(axis, rgb) * sin(hue) +
          axis * dot(axis, rgb) * (1.0 - cos(hue));
    rgb = clamp(rgb, 0.0, 1.0);
    const float alpha = sampled.a * in.tint.a * coverage;
    return float4(rgb * in.tint.rgb * in.tint.a * coverage, alpha);
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

fragment float4 linearGradientCircleFragmentMain(LinearGradientVertexOut in [[stage_in]]) {
    const float2 normalized = in.local / max(in.size, float2(0.0001));
    const float amount = clamp(in.direction < 0.5 ? normalized.x :
        (in.direction < 1.5 ? normalized.y : (normalized.x + normalized.y) * 0.5), 0.0, 1.0);
    const float4 color = mix(in.startColor, in.endColor, amount);
    const float radius = min(in.size.x, in.size.y) * 0.5;
    const float edge = distance(in.local, in.size * 0.5) - radius;
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

struct ArcVertex {
    packed_float2 position;
    packed_float2 local;
    packed_float2 size;
    float startAngle;
    float sweepAngle;
    float thickness;
    float roundCaps;
    packed_float4 color;
};

struct ArcVertexOut {
    float4 position [[position]];
    float2 local;
    float2 size;
    float startAngle;
    float sweepAngle;
    float thickness;
    float roundCaps;
    float4 color;
};

vertex ArcVertexOut arcVertexMain(const device ArcVertex* vertices [[buffer(0)]],
                                  uint vertexId [[vertex_id]]) {
    const ArcVertex value = vertices[vertexId];
    return {float4(value.position, 0.0, 1.0), value.local, value.size,
            value.startAngle, value.sweepAngle, value.thickness, value.roundCaps, value.color};
}

fragment float4 arcFragmentMain(ArcVertexOut in [[stage_in]]) {
    constexpr float twoPi = 6.28318530718;
    const float halfThickness = in.thickness * 0.5;
    const float radius = max(0.0, min(in.size.x, in.size.y) * 0.5 - halfThickness - 1.0);
    const float2 point = in.local - in.size * 0.5;
    const float radialDistance = abs(length(point) - radius) - halfThickness;
    float angle = atan2(point.y, point.x);
    if (angle < 0.0) angle += twoPi;
    float start = fmod(in.startAngle, twoPi);
    if (start < 0.0) start += twoPi;
    float relative = fmod(angle - start + twoPi, twoPi);
    float angularDistance = -halfThickness;
    if (in.sweepAngle < twoPi - 0.0001) {
        angularDistance = relative <= in.sweepAngle
            ? -min(relative, in.sweepAngle - relative) * max(radius, 1.0)
            : min(relative - in.sweepAngle, twoPi - relative) * max(radius, 1.0);
    }
    float distance = max(radialDistance, angularDistance);
    if (in.roundCaps > 0.5 && in.sweepAngle < twoPi - 0.0001) {
        const float2 startCenter = float2(cos(start), sin(start)) * radius;
        const float end = start + in.sweepAngle;
        const float2 endCenter = float2(cos(end), sin(end)) * radius;
        distance = min(distance, min(length(point - startCenter) - halfThickness,
                                     length(point - endCenter) - halfThickness));
    }
    const float antialias = max(fwidth(distance), 0.75);
    const float coverage = 1.0 - smoothstep(0.0, antialias, distance);
    return float4(in.color.rgb * in.color.a, in.color.a) * coverage;
}

struct GradientArcVertex {
    packed_float2 position;
    packed_float2 local;
    packed_float2 size;
    float startAngle;
    float sweepAngle;
    float thickness;
    float roundCaps;
    packed_float4 startColor;
    packed_float4 endColor;
};

struct GradientArcVertexOut {
    float4 position [[position]];
    float2 local;
    float2 size;
    float startAngle;
    float sweepAngle;
    float thickness;
    float roundCaps;
    float4 startColor;
    float4 endColor;
};

vertex GradientArcVertexOut gradientArcVertexMain(
    const device GradientArcVertex* vertices [[buffer(0)]], uint vertexId [[vertex_id]]) {
    const GradientArcVertex value = vertices[vertexId];
    return {float4(value.position, 0.0, 1.0), value.local, value.size,
            value.startAngle, value.sweepAngle, value.thickness, value.roundCaps,
            value.startColor, value.endColor};
}

fragment float4 gradientArcFragmentMain(GradientArcVertexOut in [[stage_in]]) {
    constexpr float twoPi = 6.28318530718;
    const float halfThickness = in.thickness * 0.5;
    const float radius = max(0.0, min(in.size.x, in.size.y) * 0.5 - halfThickness - 1.0);
    const float2 point = in.local - in.size * 0.5;
    const float radialDistance = abs(length(point) - radius) - halfThickness;
    float angle = atan2(point.y, point.x);
    if (angle < 0.0) angle += twoPi;
    float start = fmod(in.startAngle, twoPi);
    if (start < 0.0) start += twoPi;
    const float relative = fmod(angle - start + twoPi, twoPi);
    float angularDistance = -halfThickness;
    if (in.sweepAngle < twoPi - 0.0001) {
        angularDistance = relative <= in.sweepAngle
            ? -min(relative, in.sweepAngle - relative) * max(radius, 1.0)
            : min(relative - in.sweepAngle, twoPi - relative) * max(radius, 1.0);
    }
    float distance = max(radialDistance, angularDistance);
    if (in.roundCaps > 0.5 && in.sweepAngle < twoPi - 0.0001) {
        const float2 startCenter = float2(cos(start), sin(start)) * radius;
        const float end = start + in.sweepAngle;
        const float2 endCenter = float2(cos(end), sin(end)) * radius;
        distance = min(distance, min(length(point - startCenter) - halfThickness,
                                     length(point - endCenter) - halfThickness));
    }
    const float antialias = max(fwidth(distance), 0.75);
    const float coverage = 1.0 - smoothstep(0.0, antialias, distance);
    const float progress = clamp(relative / max(in.sweepAngle, 0.0001), 0.0, 1.0);
    const float4 color = mix(in.startColor, in.endColor, progress);
    return float4(color.rgb * color.a, color.a) * coverage;
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

struct GridPatternVertex {
    packed_float2 position;
    packed_float2 local;
    packed_float2 size;
    float spacing;
    float minorWidth;
    float majorWidth;
    packed_float2 offset;
    float majorEvery;
    float cornerRadius;
    packed_float4 minorColor;
    packed_float4 majorColor;
};

struct GridPatternVertexOut {
    float4 position [[position]];
    float2 local;
    float2 size;
    float spacing;
    float minorWidth;
    float majorWidth;
    float2 offset;
    float majorEvery;
    float cornerRadius;
    float4 minorColor;
    float4 majorColor;
};

vertex GridPatternVertexOut gridPatternVertexMain(
    const device GridPatternVertex* vertices [[buffer(0)]], uint vertexId [[vertex_id]]) {
    const GridPatternVertex value = vertices[vertexId];
    return {float4(value.position, 0.0, 1.0), value.local, value.size, value.spacing,
            value.minorWidth, value.majorWidth, value.offset, value.majorEvery, value.cornerRadius,
            value.minorColor, value.majorColor};
}

fragment float4 gridPatternFragmentMain(GridPatternVertexOut in [[stage_in]]) {
    const float2 coordinate = (in.local + in.offset) / in.spacing;
    const float2 nearest = round(coordinate);
    const float2 lineDistance = abs(coordinate - nearest) * in.spacing;
    const float minorDistance = min(lineDistance.x, lineDistance.y);
    const bool majorX = fmod(abs(nearest.x), in.majorEvery) < 0.5;
    const bool majorY = fmod(abs(nearest.y), in.majorEvery) < 0.5;
    const float majorDistance = min(majorX ? lineDistance.x : 1.0e20,
                                    majorY ? lineDistance.y : 1.0e20);
    const float aa = max(fwidth(in.local.x) + fwidth(in.local.y), 0.75);
    const float minorCoverage = 1.0 - smoothstep(in.minorWidth * 0.5 - aa,
                                                 in.minorWidth * 0.5 + aa, minorDistance);
    const float majorCoverage = 1.0 - smoothstep(in.majorWidth * 0.5 - aa,
                                                 in.majorWidth * 0.5 + aa, majorDistance);
    const float minorAlpha = in.minorColor.a * minorCoverage * (1.0 - majorCoverage);
    const float majorAlpha = in.majorColor.a * majorCoverage;
    const float2 halfSize = in.size * 0.5;
    const float radius = min(in.cornerRadius, min(halfSize.x, halfSize.y));
    const float2 q = abs(in.local - halfSize) - halfSize + radius;
    const float edge = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    const float mask = 1.0 - smoothstep(0.0, max(fwidth(edge), 0.75), edge);
    return float4((in.minorColor.rgb * minorAlpha + in.majorColor.rgb * majorAlpha) * mask,
                  (minorAlpha + majorAlpha) * mask);
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
