# Kubernetes Pod Networking

How traffic gets from one pod to another, from outside the cluster to a pod, and from a pod to the outside world. The Kubernetes network model is opinionated: every pod gets its own IP, every pod can talk to every other pod without NAT, and the agents on a node can talk to all pods on that node.

## Layers

- **Pod IP** — every pod gets one IP from the cluster's pod CIDR. Containers inside a pod share that IP and the same network namespace; they reach each other on `localhost`.
- **Node** — runs many pods. The node has its own IP on the host network. The CNI plugin (Calico, Cilium, Flannel) sets up the routes and the bridge so pods on the same node can reach each other and so cross-node traffic finds the right next hop.
- **Service** — a stable virtual IP (ClusterIP) that load-balances across a set of pods selected by a label. The selector matches pods by label, the endpoints controller maintains the list of matching pod IPs.
- **kube-proxy** — runs on every node. Watches Services and Endpoints, programs iptables (or IPVS) rules so that traffic to a ClusterIP gets DNAT'd to one of the backing pod IPs.

## How a request flows in

External user wants to reach a pod:

1. **DNS** resolves `myapp.example.com` to a public load balancer's IP (cloud LB or MetalLB).
2. **External load balancer** forwards to one of the cluster nodes on the Service's NodePort, OR an Ingress controller pod handles HTTP routing and forwards to the right Service.
3. **Node receives traffic on NodePort.** kube-proxy's iptables rules DNAT the destination from `nodeIP:nodePort` to one of the backing pod IPs on the cluster pod network.
4. **CNI routes the packet to the destination pod.** If the pod is on this node, it goes through the node's bridge directly. If the pod is on a different node, the CNI uses an overlay (VXLAN, Wireguard) or BGP routes (Calico) to forward.
5. **Pod's container receives the packet** on its pod IP. The container's process accepts the connection.

## Pod-to-pod inside the cluster

Pod A wants to call Pod B via a Service. Pod A resolves `myservice.mynamespace.svc.cluster.local` via CoreDNS, which returns the Service's ClusterIP. Pod A's outbound packet to that ClusterIP gets caught by kube-proxy's iptables rules on Pod A's node and DNAT'd to one of Pod B's actual pod IPs. Then the CNI routes the rewritten packet (now destined for a real pod IP) to wherever that pod lives.

## What to draw

A useful K8s networking diagram shows: external user → LB → Ingress / Service → kube-proxy on the node → CNI → target pod. Group pods inside their nodes, group nodes inside the cluster boundary, draw the LB outside the cluster.
