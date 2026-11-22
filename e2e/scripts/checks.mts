/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The checks that keep the scripts of the test environment on what they own: a download is used only with
// its pinned digest; a cluster is reached only through a kubeconfig of the scripts whose one API server is
// on a loopback address, published there by the node that the scripts recorded when they created it;
// Docker is the local one; and a container is deleted only when the development provider made it for a
// workload cluster of the scripts. They are pure, and each one is tested on the cases it refuses.

import { createHash } from "node:crypto";
import { isIPv4 } from "node:net";

export function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function sha256(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

// The check of a download before it is used: its SHA-256 is the pinned one.
export function assertDigest(name: string, content: Uint8Array, pinned: string): void {
  ensure(/^[0-9a-f]{64}$/.test(pinned), `The pin of ${name} is not a SHA-256 digest`);

  const actual = sha256(content);

  ensure(actual === pinned, `${name} has the SHA-256 ${actual}, and the pin is ${pinned}: it is not used`);
}

// Whether the host of a URL, as URL parses it, is a loopback address: 127.0.0.0/8, or ::1. A name is not,
// localhost included: what it resolves to is decided outside the scripts.
export function isLoopbackHost(hostname: string): boolean {
  if (hostname === "[::1]") return true;
  return isIPv4(hostname) && hostname.startsWith("127.");
}

// A kubeconfig, as `kubectl config view --raw -o json` prints it.
interface Kubeconfig {
  "current-context"?: string;
  contexts?: { name?: string; context?: { cluster?: string; user?: string; namespace?: string } }[];
  clusters?: { name?: string; cluster?: Record<string, unknown> }[];
  users?: { name?: string; user?: Record<string, unknown> }[];
}

// The API server of a kubeconfig of the scripts, checked before any request: one context, the one named,
// which is current; one cluster, reached over HTTPS on a loopback address, verified with the authority that
// kind wrote and through no proxy; one user, with the client certificate that kind generated.
export function localApiServer(config: unknown, context: string): URL {
  const kubeconfig = config as Kubeconfig;

  ensure(typeof config === "object" && config !== null, "The kubeconfig is not an object");
  ensure(
    kubeconfig.contexts?.length === 1 && kubeconfig.clusters?.length === 1 && kubeconfig.users?.length === 1,
    `The kubeconfig of ${context} does not hold one context, one cluster and one user`,
  );

  const [entry] = kubeconfig.contexts;
  const [cluster] = kubeconfig.clusters;
  const [user] = kubeconfig.users;

  ensure(
    entry.name === context && kubeconfig["current-context"] === context,
    `The kubeconfig of ${context} names another context`,
  );
  ensure(
    entry.context?.cluster === cluster.name && entry.context?.user === user.name,
    `The context of ${context} does not name the cluster and the user of its kubeconfig`,
  );

  const settings = cluster.cluster ?? {};
  const credentials = user.user ?? {};

  ensure(
    Object.keys(settings).every((key) => key === "server" || key === "certificate-authority-data") &&
      typeof settings["certificate-authority-data"] === "string",
    `The cluster of ${context} is not reached with the authority of kind alone`,
  );
  ensure(
    Object.keys(credentials).every((key) => key === "client-certificate-data" || key === "client-key-data") &&
      typeof credentials["client-certificate-data"] === "string" &&
      typeof credentials["client-key-data"] === "string",
    `The user of ${context} is not the client certificate of kind`,
  );
  ensure(
    typeof settings.server === "string" && URL.canParse(settings.server),
    `The API server of ${context} is not a URL`,
  );

  const server = new URL(settings.server);

  ensure(server.protocol === "https:", `The API server of ${context} is not reached over HTTPS`);
  ensure(
    isLoopbackHost(server.hostname),
    `The API server of ${context} is ${server.host}, which is not a loopback address: the scripts refuse it`,
  );
  ensure(/^\d+$/.test(server.port), `The API server of ${context} has no port`);
  return server;
}

// A container, as `docker inspect` prints it.
interface Container {
  Id?: string;
  Name?: string;
  State?: { Running?: boolean };
  Config?: { Labels?: Record<string, string> };
  Mounts?: { Source?: string; Destination?: string }[];
  NetworkSettings?: { Ports?: Record<string, { HostIp?: string; HostPort?: string }[] | null> };
}

// What the node of a kind cluster of the scripts is: the name of the cluster, the API server of its
// kubeconfig, the ID of the container that the scripts recorded when they created the cluster, and, for the
// cluster of the real project, the socket of Docker that the development provider uses.
export interface KindNodeExpected {
  name: string;
  server: URL;
  nodeId: string | undefined;
  dockerSocket: boolean;
}

// The control plane node of a kind cluster of the scripts: the container they created, still running, which
// publishes the API server of the kubeconfig on its loopback address and port. A kind cluster of the same
// name made by anyone else is another container, and is refused.
export function assertKindNode(inspected: unknown, expected: KindNodeExpected): void {
  const { name, server } = expected;
  const nodes = inspected as Container[];

  ensure(Array.isArray(nodes) && nodes.length === 1, `Docker does not have one node for the kind cluster ${name}`);

  const [node] = nodes;
  const labels = node.Config?.Labels ?? {};

  ensure(
    expected.nodeId !== undefined,
    `The state folder has no record of the node of the kind cluster ${name}, so the scripts did not create it from there`,
  );
  ensure(
    node.Id === expected.nodeId,
    `The node of the kind cluster ${name} is not the container that the scripts created: it is refused`,
  );
  ensure(
    node.Name === `/${name}-control-plane` &&
      labels["io.x-k8s.kind.cluster"] === name &&
      labels["io.x-k8s.kind.role"] === "control-plane",
    `The container ${node.Name} is not the control plane node of the kind cluster ${name}`,
  );
  ensure(
    node.State?.Running === true,
    `The node of the kind cluster ${name} is not running: start it with docker start ${name}-control-plane, or take the environment down`,
  );

  const bindings = node.NetworkSettings?.Ports?.["6443/tcp"] ?? [];
  const host = server.hostname.replace(/^\[(.*)\]$/, "$1");

  ensure(
    bindings.length === 1 && bindings[0].HostIp === host && bindings[0].HostPort === server.port,
    `The node of the kind cluster ${name} does not publish its API server at ${server.host}`,
  );
  ensure(
    !expected.dockerSocket || (node.Mounts ?? []).some((mount) => mount.Destination === "/var/run/docker.sock"),
    `The node of the kind cluster ${name} does not mount the socket of Docker`,
  );
}

// Docker is the local one, reached through a Unix socket: DOCKER_HOST when it is set, which takes the place
// of the context, and the endpoint of the current context. A daemon reached over TCP or SSH runs the
// containers of another machine, where `up` created nothing and `down` must delete nothing.
export function assertLocalDocker(dockerHost: string | undefined, contextEndpoint: string): void {
  for (const endpoint of dockerHost ? [dockerHost, contextEndpoint] : [contextEndpoint]) {
    ensure(
      endpoint.startsWith("unix://"),
      `Docker is reached at ${endpoint}: the scripts need the local Docker, through its Unix socket`,
    );
  }
}

// The roles that kind gives its containers, which the development provider gives the containers of a
// workload cluster too.
const KIND_ROLES = ["control-plane", "worker", "external-load-balancer"];

// The IDs of the containers of a workload cluster of the scripts, among those that Docker lists with its
// label. The development provider gives each of them the labels of kind, `io.x-k8s.kind.cluster` with the
// name of the workload cluster and `io.x-k8s.kind.role`, and names it after the workload cluster:
// `<cluster>-lb` for the load balancer, `<cluster>-<machine>` for a node, where the name of a machine ends
// with a random part. kind names the nodes of a kind cluster `<cluster>-control-plane`, `<cluster>-worker`,
// `<cluster>-worker2` and `<cluster>-external-load-balancer`, which the provider never does. A labelled
// container that is not so named, that has another role, or that kind would have named, is not one of them:
// then none is returned, and every container of that workload cluster is left in place.
export function workloadContainerIds(inspected: unknown, workload: string): string[] {
  const containers = inspected as Container[];
  const kindNode = /^-(control-plane|worker|external-load-balancer)\d*$/;

  ensure(Array.isArray(containers), "docker inspect did not print a list of containers");
  for (const container of containers) {
    const labels = container.Config?.Labels ?? {};
    const name = container.Name ?? "";

    ensure(
      typeof container.Id === "string" &&
        name.startsWith(`/${workload}-`) &&
        !kindNode.test(name.slice(workload.length + 1)) &&
        labels["io.x-k8s.kind.cluster"] === workload &&
        KIND_ROLES.includes(labels["io.x-k8s.kind.role"] ?? ""),
      `The container ${name} is labelled as a node of ${workload}, and is not one that the development provider makes: every container of ${workload} is left in place`,
    );
  }
  return containers.map((container) => container.Id as string);
}
