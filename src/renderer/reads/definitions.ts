/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The definitions that the page reads for the references of its Clusters (SPEC-0004, P3; SPEC-0001, A2): the
// definition of the kind that a reference names, from the store of definitions of the host when it holds it, and
// otherwise, for a user who may not list the definitions, with a GET of that one definition by its name, whose
// plural the API that the host registers from the discovery of the cluster gives. The store of definitions is only
// read: the host subscribes it itself (P19). A GET runs once for each definition in a mount of the page, from an
// effect, never from a render.

import { Renderer } from "@freelensapp/extensions";
import { observable, runInAction } from "mobx";
import { failureOf } from "../../common/views/read-state";
import { definitionOf, findDefinition } from "../../common/views/references";

import type { DefinitionData, DefinitionRead } from "../../common/views/references";

type HostObject = Renderer.K8sApi.KubeObject;

// What the page reads of the store of definitions of the host.
export interface DefinitionsStore {
  readonly isLoaded: boolean;
  readonly failedLoading: boolean;
  readonly items: readonly HostObject[];
}

// The API that the host registered for a kind of a group, at any version.
export type FindApi = (group: string, kind: string) => { readonly apiBase: string } | undefined;

// The GET of one definition by its name.
export type GetDefinition = (name: string) => Promise<HostObject | null>;

export interface DefinitionsHost {
  readonly store: () => DefinitionsStore;
  readonly findApi: FindApi;
  readonly get: GetDefinition;
}

// The definitions of the host, through the extension API.
export const HOST_DEFINITIONS: DefinitionsHost = {
  store: () => Renderer.K8sApi.crdStore,
  findApi: (group, kind) =>
    Renderer.K8sApi.apiManager.getApi(
      (api) => api.kind === kind && (api.apiVersionWithGroup ?? "").startsWith(`${group}/`),
    ),
  get: (name) => Renderer.K8sApi.crdApi.get({ name }),
};

// The name of a definition, from the base of the API of its kind, `/apis/<group>/<version>/<plural>`.
function nameFromApi(apiBase: string, group: string): string | undefined {
  const plural = apiBase.split("/").pop();

  return plural === undefined || plural === "" ? undefined : `${plural}.${group}`;
}

export class DefinitionReads {
  readonly #host: DefinitionsHost;
  // The reads by GET, by the name of the definition.
  readonly #fetched = observable.map<string, DefinitionRead>({}, { deep: false });

  constructor(host: DefinitionsHost = HOST_DEFINITIONS) {
    this.#host = host;
  }

  // The definition of a kind of a group, as far as it is read.
  readOf(group: string, kind: string): DefinitionRead {
    const store = this.#host.store();

    if (!store.failedLoading) {
      if (!store.isLoaded) return { state: "pending" };

      const definitions = store.items.map(definitionOf).filter((item): item is DefinitionData => item !== undefined);
      const found = findDefinition(definitions, group, kind);

      return found === undefined ? { state: "not-served" } : { state: "read", definition: found };
    }

    const api = this.#host.findApi(group, kind);
    const name = api === undefined ? undefined : nameFromApi(api.apiBase, group);

    if (name === undefined) return { state: "not-served" };
    return this.#fetched.get(name) ?? { state: "pending" };
  }

  // Forgets the reads by GET that were refused or failed, so that the next request asks for them again, for the
  // refresh of a view (SPEC-0005, P23); a definition that was read keeps its read, and one that the cluster does not
  // serve is not asked again either. The store of definitions of the host, which the host subscribes, is not loaded
  // again.
  forgetFailures(): void {
    runInAction(() =>
      this.#fetched.replace(
        [...this.#fetched].filter(([, read]) => read.state !== "refused" && read.state !== "failed"),
      ),
    );
  }

  // Starts the GET of the definitions that the store of definitions does not give, once each, for an effect of the
  // page. A result that arrives after the page closed lands in this object alone.
  request(kinds: readonly { readonly group: string; readonly kind: string }[]): void {
    if (!this.#host.store().failedLoading) return;

    for (const { group, kind } of kinds) {
      const api = this.#host.findApi(group, kind);
      const name = api === undefined ? undefined : nameFromApi(api.apiBase, group);

      if (name === undefined || this.#fetched.has(name)) continue;
      runInAction(() => this.#fetched.set(name, { state: "pending" }));
      this.#host.get(name).then(
        (object) => {
          const definition = object === null ? undefined : definitionOf(object);

          runInAction(() =>
            this.#fetched.set(name, definition === undefined ? { state: "not-served" } : { state: "read", definition }),
          );
        },
        (error: unknown) => {
          const failure = failureOf(error);

          runInAction(() => this.#fetched.set(name, { state: failure.refused ? "refused" : "failed", failure }));
        },
      );
    }
  }
}
