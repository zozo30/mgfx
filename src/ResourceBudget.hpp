#pragma once

#include <cstddef>
#include <cstdint>
#include <unordered_map>

namespace gfx {

struct ResourceUsage final {
    std::size_t resources = 0;
    std::size_t maximumResources = 0;
    std::size_t cost = 0;
    std::size_t maximumCost = 0;
};

class ResourceBudget final {
public:
    ResourceBudget(std::size_t maximumResources, std::size_t maximumCost)
        : maximumResources_(maximumResources), maximumCost_(maximumCost) {}

    bool wouldAccept(std::uint32_t id, std::size_t cost) const {
        const auto found = costs_.find(id);
        const std::size_t previous = found == costs_.end() ? 0 : found->second;
        const std::size_t resources = costs_.size() + (found == costs_.end() ? 1 : 0);
        return id != 0 && resources <= maximumResources_ && cost <= maximumCost_ &&
               totalCost_ - previous <= maximumCost_ - cost;
    }

    bool commit(std::uint32_t id, std::size_t cost) {
        if (!wouldAccept(id, cost)) return false;
        const auto found = costs_.find(id);
        if (found != costs_.end()) totalCost_ -= found->second;
        costs_[id] = cost;
        totalCost_ += cost;
        return true;
    }

    void remove(std::uint32_t id) {
        const auto found = costs_.find(id);
        if (found == costs_.end()) return;
        totalCost_ -= found->second;
        costs_.erase(found);
    }

    void clear() { costs_.clear(); totalCost_ = 0; }
    std::size_t resources() const { return costs_.size(); }
    std::size_t cost() const { return totalCost_; }
    ResourceUsage usage() const {
        return {costs_.size(), maximumResources_, totalCost_, maximumCost_};
    }

private:
    std::size_t maximumResources_;
    std::size_t maximumCost_;
    std::size_t totalCost_ = 0;
    std::unordered_map<std::uint32_t, std::size_t> costs_;
};

} // namespace gfx
