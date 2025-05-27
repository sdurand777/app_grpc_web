
import collections

# voxel filter
def apply_voxel_grid_filter(pointcloud, voxel_size=0.01):
    """Filtre voxel grid existant"""
    voxel_dict = collections.defaultdict(list)

    for point in pointcloud.points:
        voxel_idx = (
            int(point.x / voxel_size),
            int(point.y / voxel_size),
            int(point.z / voxel_size)
        )
        voxel_dict[voxel_idx].append(point)

    filtered_points = []
    for points in voxel_dict.values():
        n = len(points)
        centroid_x = sum(p.x for p in points) / n
        centroid_y = sum(p.y for p in points) / n
        centroid_z = sum(p.z for p in points) / n

        closest_point = min(
            points,
            key=lambda p: (p.x - centroid_x) ** 2 + (p.y - centroid_y) ** 2 + (p.z - centroid_z) ** 2
        )

        new_point = type(closest_point)()
        new_point.x = centroid_x
        new_point.y = centroid_y
        new_point.z = centroid_z
        if hasattr(closest_point, 'r') and hasattr(closest_point, 'g') and hasattr(closest_point, 'b'):
            new_point.r = closest_point.r
            new_point.g = closest_point.g
            new_point.b = closest_point.b

        filtered_points.append(new_point)

    new_pointcloud = type(pointcloud)()
    new_pointcloud.points.extend(filtered_points)
    return new_pointcloud


