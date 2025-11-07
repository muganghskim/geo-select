/** equirectangular projection (lon,lat) -> x,y */
export function project(lon, lat, width, height) {
    const x = ((lon + 180) / 360) * width;
    const y = ((90 - lat) / 180) * height;
    return [x, y];
}
function centroidOfCoordinates(coords) {
    let sumX = 0, sumY = 0, count = 0;
    coords.forEach(([lon, lat]) => {
        sumX += lon;
        sumY += lat;
        count += 1;
    });
    return [sumX / count, sumY / count];
}
export function featureCentroid(feature) {
    if (!feature.geometry)
        return null;
    const g = feature.geometry;
    if (g.type === 'Polygon') {
        // Polygon: [ [ [lon,lat], ... ] , ... ]
        const rings = g.coordinates;
        return centroidOfCoordinates(rings[0]);
    }
    if (g.type === 'MultiPolygon') {
        const multipolys = g.coordinates;
        // pick the first polygon's first ring
        if (multipolys.length > 0 && multipolys[0].length > 0) {
            return centroidOfCoordinates(multipolys[0][0]);
        }
        return null;
    }
    if (g.type === 'Point') {
        const p = g.coordinates;
        return [p[0], p[1]];
    }
    return null;
}
export function toRegion(feature) {
    const props = (feature.properties || {});
    const id = props.ISO_A3 || props.iso_a3 || props.id || props.code || undefined;
    const name = props.NAME || props.ADMIN || props.name || undefined;
    const cent = featureCentroid(feature) || undefined;
    return { id, name, properties: props, centroid: cent };
}
