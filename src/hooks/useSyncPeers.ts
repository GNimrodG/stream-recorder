import { useEffect, useState } from "react";
import { ALL_INSTANCES, InstanceIdentity, PublicSyncPeer } from "@/types/sync";

export interface ExecutionInstanceOption {
  id: string;
  label: string;
}

/**
 * Loads this instance's identity plus its enabled linked peers, and builds the option list for
 * the "Record on" assignment dropdowns shown in the recording/stream dialogs.
 */
export function useSyncPeers(active: boolean) {
  const [localInstanceId, setLocalInstanceId] = useState<string>("");
  const [options, setOptions] = useState<ExecutionInstanceOption[]>([]);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    (async () => {
      try {
        const [instanceResponse, peersResponse] = await Promise.all([
          fetch("/api/sync/instance"),
          fetch("/api/sync/peers"),
        ]);
        const instance: InstanceIdentity = await instanceResponse.json();
        const peers: PublicSyncPeer[] = await peersResponse.json();

        if (cancelled) return;

        setLocalInstanceId(instance.instanceId);
        setOptions([
          { id: instance.instanceId, label: `This instance (${instance.name})` },
          ...peers.filter((peer) => peer.enabled).map((peer) => ({ id: peer.instanceId, label: peer.name })),
          { id: ALL_INSTANCES, label: "All linked instances" },
        ]);
      } catch (error) {
        console.error("Failed to load sync peers:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active]);

  return { localInstanceId, options };
}
