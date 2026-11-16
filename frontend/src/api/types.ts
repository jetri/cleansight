import { z } from 'zod';

// Resource schemas describe the Django boundary, not a browser event reducer.
// Unrecognized extension fields are ignored; missing required facts fail closed.
export const identity = z.uuid();
export const sourceTime = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const jsonObject = z.record(z.string(), z.unknown());
export const pointSchema = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);
export const polygonSchema = z.object({
  name: z.string().min(1).max(80),
  points: z.array(pointSchema).min(3).max(128),
});
export const geometrySchema = z.object({
  zones: z.array(polygonSchema).min(1).max(32),
  exclusions: z.array(polygonSchema).max(32),
  boundary: z.number().min(0).max(0.25),
});
export const cameraSchema = z.object({
  id: identity,
  name: z.string(),
  kind: z.enum(['rtsp', 'file_fixture']),
  secret_ref: z.string(),
  permission_ref: z.string(),
  data_provenance: z.string(),
  desired_recording: z.boolean(),
  active_revision: identity.nullable(),
});
export const configurationSchema = z.object({
  id: identity,
  sequence: z.number().int().positive(),
  geometry: geometrySchema,
  settings: jsonObject,
  digest: z.string(),
  activated_at: z.string(),
  activation_watermark: jsonObject,
});
export const gapSchema = z.object({
  id: identity.optional(),
  epoch_id: identity.nullable().optional(),
  start_us: sourceTime.nullable(),
  end_us: sourceTime.nullable(),
  reason: z.string(),
  created_at: z.string().optional(),
  ended_at: z.string().nullable().optional(),
});
export const epochSchema = z.object({
  id: identity,
  sequence: z.number().int(),
  reason: z.string(),
  arrival_anchor: z.string(),
  mapping: z.string(),
});
export const sessionSchema = z.object({
  id: identity,
  camera: identity,
  configuration: identity,
  provenance: z.string(),
  status: z.string(),
  started_at: z.string(),
  stopped_at: z.string().nullable(),
  health: jsonObject,
  epochs: z.array(epochSchema),
  gaps: z.array(gapSchema),
});
export const manifestSegmentSchema = z.object({
  id: identity,
  epoch: identity,
  start_us: sourceTime,
  end_us: sourceTime,
  sha256: z.string(),
});
export const runSummarySchema = z.object({
  id: identity,
  session_id: identity,
  configuration_id: identity,
  mode: z.enum(['media_replay', 'observation_fixture']),
  created_at: z.string(),
  versions: jsonObject,
});
export const runSchema = z.object({
  id: identity,
  mode: z.enum(['media_replay', 'observation_fixture']),
  configuration: identity,
  input_manifest: z.object({
    session: identity,
    segments: z.array(manifestSegmentSchema),
    gaps: z.array(gapSchema),
    clock: z.string(),
  }),
  versions: jsonObject,
});
export const transitionSchema = z.object({
  id: identity,
  sequence: z.number().int(),
  previous: z.string(),
  state: z.string(),
  source_us: sourceTime,
  reason: z.string(),
  evidence: jsonObject,
  provenance: z.string(),
  processing_at: z.string(),
  created_at: z.string(),
});
export const reviewStateSchema = z.enum([
  'new', 'under_review', 'confirmed', 'rejected', 'needs_better_footage',
]);
export const reviewSchema = z.object({
  id: identity,
  state: reviewStateSchema,
  reason: z.string(),
  notes: z.string(),
  reviewer_label: z.string(),
  supersedes_id: identity.nullable(),
  created_at: z.string(),
});
const spanSchema = z.tuple([z.number().int(), z.number().int()]);
export const clipSchema = z.object({
  id: identity,
  revision: z.number().int(),
  status: z.string(),
  requested: spanSchema,
  required: spanSchema,
  coverage: jsonObject,
  media: z.array(identity),
});
export const eventSchema = z.object({
  id: identity,
  run: identity,
  configuration: identity,
  epoch: identity,
  release_us: sourceTime,
  label: z.string(),
  phase: z.enum(['provisional', 'final']),
  machine_outcome: z.string(),
  transitions: z.array(transitionSchema),
  reviews: z.array(reviewSchema),
  clips: z.array(clipSchema),
});
export const artifactSchema = z.object({
  id: identity,
  classification: z.string(),
  status: z.string(),
  mime: z.string(),
  byte_size: z.number().int().nonnegative(),
  sha256: z.string(),
  lineage: z.array(z.unknown()),
  metadata: jsonObject,
  expires_at: z.string(),
  pins: z.array(z.object({
    id: identity, purpose: z.string(), expires_at: z.string(), released_at: z.string().nullable(),
  })),
});
export const indexedFrameSchema = z.object({
  epoch: identity,
  segment: identity,
  frame: z.number().int().nonnegative(),
  source_us: sourceTime,
  raw_pts: z.number().int(),
  time_base: z.string(),
});
export const unavailableFramesSchema = z.object({
  epoch: identity,
  segment: identity,
  unavailable: z.string(),
  span: spanSchema,
});
export const cursorSchema = z.object({ segment: z.number().int(), frame: z.number().int() });
export const timelineSchema = z.object({
  run: identity,
  mode: z.string(),
  frames: z.array(z.union([indexedFrameSchema, unavailableFramesSchema])),
  next: cursorSchema.nullable(),
  clock: z.string(),
  gaps: z.array(gapSchema),
});
export const frameJobSchema = z.object({
  id: identity,
  status: z.string(),
  reason: z.string().optional(),
  media: identity.nullable().optional(),
  source_us: sourceTime.nullable().optional(),
});
export const backendHealthSchema = z.object({
  status: z.string(),
  supervisor: z.string().nullable(),
  csrf_token: z.string().min(1),
  sources: z.number().int(),
  ui: z.string(),
  detector: z.string(),
});

export type Point = z.infer<typeof pointSchema>;
export type Polygon = z.infer<typeof polygonSchema>;
export type Geometry = z.infer<typeof geometrySchema>;
export type Camera = z.infer<typeof cameraSchema>;
export type Configuration = z.infer<typeof configurationSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Run = z.infer<typeof runSchema>;
export type RunSummary = z.infer<typeof runSummarySchema>;
export interface EventFilters { camera: string; outcome: string; reason: string; phase: string }
export type StoredEvent = z.infer<typeof eventSchema>;
export type Transition = z.infer<typeof transitionSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type ReviewState = z.infer<typeof reviewStateSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type Timeline = z.infer<typeof timelineSchema>;
export type Cursor = z.infer<typeof cursorSchema>;
export type IndexedFrame = z.infer<typeof indexedFrameSchema>;
export type FrameJob = z.infer<typeof frameJobSchema>;
export type BackendHealth = z.infer<typeof backendHealthSchema>;
export type CameraInput = Pick<Camera, 'name' | 'kind' | 'secret_ref' | 'permission_ref' | 'data_provenance'>;
export type CameraEdit = Pick<Camera, 'name' | 'secret_ref' | 'permission_ref'>;
export type ReviewInput = Pick<Review, 'state' | 'reason' | 'notes' | 'reviewer_label'> & { supersedes?: string };
