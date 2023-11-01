import {
  CoreOptions,
  CoreHightouchEvent,
  Callback,
  Integrations,
  Plan,
  TrackPlan,
  PlanEvent,
  JSONArray,
  JSONValue,
  JSONPrimitive,
  JSONObject,
  GroupTraits,
  UserTraits,
  Traits,
} from '@ht-sdks/events-sdk-js-core'

export interface Options extends CoreOptions {}

export type { GroupTraits, UserTraits, Traits }

export type EventProperties = Record<string, any>

export interface HightouchEvent extends CoreHightouchEvent {}

export type {
  Integrations,
  Plan,
  TrackPlan,
  PlanEvent,
  Callback,
  JSONArray,
  JSONValue,
  JSONPrimitive,
  JSONObject,
}
