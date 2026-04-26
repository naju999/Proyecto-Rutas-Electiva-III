-- PostgreSQL + PostGIS schema for TuRuta PWA
-- Run with a role that can create extensions and tables.

BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Keep updated_at in sync automatically.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Keep only the 2 most recent reviews per (user, route).
CREATE OR REPLACE FUNCTION keep_latest_two_reviews_per_user_route()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Serialize inserts for the same (user, route) pair to avoid race conditions.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text || ':' || NEW.route_id::text, 0));

  IF (
    SELECT COUNT(*)
    FROM route_reviews rr
    WHERE rr.user_id = NEW.user_id
      AND rr.route_id = NEW.route_id
  ) >= 2 THEN
    DELETE FROM route_reviews
    WHERE id = (
      SELECT rr_old.id
      FROM route_reviews rr_old
      WHERE rr_old.user_id = NEW.user_id
        AND rr_old.route_id = NEW.route_id
      ORDER BY rr_old.created_at ASC, rr_old.id ASC
      LIMIT 1
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure every current route version has exactly one GeoJSON for each required role.
CREATE OR REPLACE FUNCTION validate_current_route_version_geojson_triplet()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  missing_roles TEXT[];
BEGIN
  IF NEW.is_current THEN
    WITH required(role) AS (
      VALUES ('dispatch_points'::text), ('outbound_route'::text), ('inbound_route'::text)
    )
    SELECT array_agg(r.role)
    INTO missing_roles
    FROM required r
    WHERE NOT EXISTS (
      SELECT 1
      FROM route_version_geojson_files f
      WHERE f.route_version_id = NEW.id
        AND f.file_role = r.role
    );

    IF missing_roles IS NOT NULL THEN
      RAISE EXCEPTION
        'Route version % must include the 3 GeoJSON roles (dispatch_points, outbound_route, inbound_route). Missing: %',
        NEW.id,
        missing_roles;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS route_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  source_file TEXT,
  -- Optional merged/denormalized GeoJSON for compatibility.
  geojson JSONB,
  -- Optional denormalized geometry for spatial queries and intersections.
  geom geometry(MultiLineString, 4326),
  checksum TEXT,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (route_id, version)
);

CREATE TABLE IF NOT EXISTS route_version_geojson_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_version_id UUID NOT NULL REFERENCES route_versions(id) ON DELETE CASCADE,
  -- Exactly 3 files per route version: dispatch points + 2 directions.
  file_role TEXT NOT NULL CHECK (file_role IN ('dispatch_points', 'outbound_route', 'inbound_route')),
  source_file TEXT NOT NULL,
  geojson JSONB NOT NULL,
  geom geometry(Geometry, 4326),
  checksum TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (route_version_id, file_role)
);

CREATE TABLE IF NOT EXISTS route_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_version_id UUID NOT NULL REFERENCES route_versions(id) ON DELETE CASCADE,
  stop_order INTEGER NOT NULL CHECK (stop_order > 0),
  name TEXT NOT NULL,
  location geometry(Point, 4326) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (route_version_id, stop_order)
);

CREATE TABLE IF NOT EXISTS user_favorites (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, route_id)
);

CREATE TABLE IF NOT EXISTS route_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  driver_treatment_rating SMALLINT NOT NULL CHECK (driver_treatment_rating BETWEEN 1 AND 5),
  driving_quality_rating SMALLINT NOT NULL CHECK (driving_quality_rating BETWEEN 1 AND 5),
  travel_time_rating SMALLINT NOT NULL CHECK (travel_time_rating BETWEEN 1 AND 5),
  road_condition_rating SMALLINT NOT NULL CHECK (road_condition_rating BETWEEN 1 AND 5),
  -- Equal-weight average of the 4 aspect ratings.
  overall_rating NUMERIC(3,2)
    GENERATED ALWAYS AS (
      (
        driver_treatment_rating +
        driving_quality_rating +
        travel_time_rating +
        road_condition_rating
      )::numeric / 4
    ) STORED,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Optional: server-side sync/audit log (useful for debugging offline sync).
CREATE TABLE IF NOT EXISTS sync_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  action TEXT NOT NULL,
  payload JSONB,
  status TEXT NOT NULL DEFAULT 'ok',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure only one current version per route.
CREATE UNIQUE INDEX IF NOT EXISTS ux_route_versions_current_per_route
ON route_versions(route_id)
WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_routes_active ON routes(active);
CREATE INDEX IF NOT EXISTS idx_route_versions_route_id ON route_versions(route_id);
CREATE INDEX IF NOT EXISTS idx_route_versions_route_id_version ON route_versions(route_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_route_versions_geom ON route_versions USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_route_version_geojson_files_route_version
  ON route_version_geojson_files(route_version_id, file_role);
CREATE INDEX IF NOT EXISTS idx_route_version_geojson_files_geom
  ON route_version_geojson_files USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_route_stops_location ON route_stops USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_route_stops_route_version ON route_stops(route_version_id, stop_order);
CREATE INDEX IF NOT EXISTS idx_route_reviews_route_created ON route_reviews(route_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_route_reviews_user_route_created
  ON route_reviews(user_id, route_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_events_created ON sync_events(created_at DESC);

DROP TRIGGER IF EXISTS trg_users_set_updated_at ON users;
CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_routes_set_updated_at ON routes;
CREATE TRIGGER trg_routes_set_updated_at
BEFORE UPDATE ON routes
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_route_reviews_keep_latest_two ON route_reviews;
CREATE TRIGGER trg_route_reviews_keep_latest_two
BEFORE INSERT ON route_reviews
FOR EACH ROW
EXECUTE FUNCTION keep_latest_two_reviews_per_user_route();

DROP TRIGGER IF EXISTS trg_route_versions_require_geojson_triplet ON route_versions;
CREATE TRIGGER trg_route_versions_require_geojson_triplet
BEFORE INSERT OR UPDATE OF is_current ON route_versions
FOR EACH ROW
EXECUTE FUNCTION validate_current_route_version_geojson_triplet();

-- Aggregated per-route ratings and comment counts.
CREATE OR REPLACE VIEW route_review_summary AS
SELECT
  rr.route_id,
  COUNT(*)::INTEGER AS total_reviews,
  COUNT(*) FILTER (WHERE rr.comment IS NOT NULL AND btrim(rr.comment) <> '')::INTEGER AS total_comments,
  ROUND(AVG(rr.driver_treatment_rating)::numeric, 2) AS avg_driver_treatment_rating,
  ROUND(AVG(rr.driving_quality_rating)::numeric, 2) AS avg_driving_quality_rating,
  ROUND(AVG(rr.travel_time_rating)::numeric, 2) AS avg_travel_time_rating,
  ROUND(AVG(rr.road_condition_rating)::numeric, 2) AS avg_road_condition_rating,
  ROUND(AVG(rr.overall_rating)::numeric, 2) AS avg_overall_rating
FROM route_reviews rr
GROUP BY rr.route_id;

COMMIT;

-- ------------------------------
-- Optional helpers and examples
-- ------------------------------

-- Recommended query: fetch active routes with current GeoJSON.
-- SELECT r.id, r.code, r.name, rv.version, rv.geojson
-- FROM routes r
-- JOIN route_versions rv ON rv.route_id = r.id AND rv.is_current = TRUE
-- WHERE r.active = TRUE
-- ORDER BY r.code;

-- Example: insert Route A1 and first version from a GeoJSON file payload.
-- 1) Insert route metadata
-- INSERT INTO routes (code, name, description)
-- VALUES ('A1', 'Ruta A1 - Centro / Norte', 'Conecta el centro con el corredor norte')
-- ON CONFLICT (code) DO UPDATE
-- SET name = EXCLUDED.name,
--     description = EXCLUDED.description,
--     updated_at = now();

-- 2) Insert version (replace :geojson_payload with real JSON text)
-- WITH route_row AS (
--   SELECT id FROM routes WHERE code = 'A1'
-- )
-- INSERT INTO route_versions (route_id, version, source_file, geojson, geom, checksum, is_current)
-- SELECT
--   rr.id,
--   1,
--   'GEOJsonRuta1.geojson',
--   :geojson_payload::jsonb,
--   ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON((
--     SELECT jsonb_build_object('type','MultiLineString','coordinates',
--       jsonb_agg(feature->'geometry'->'coordinates'))
--     FROM jsonb_array_elements(:geojson_payload::jsonb->'features') AS feature
--     WHERE feature->'geometry'->>'type' = 'LineString'
--   )::text), 4326)),
--   md5(:geojson_payload),
--   TRUE
-- FROM route_row rr;

-- 3) If you insert a new current version, unset previous current version.
-- UPDATE route_versions
-- SET is_current = FALSE
-- WHERE route_id = (SELECT id FROM routes WHERE code = 'A1')
--   AND id <> :new_route_version_id
--   AND is_current = TRUE;
