import { useAuth } from "./auth";
import { can, type Resource } from "@/lib/permissions";

export function usePermission(resource: Resource, write = false) {
  const user = useAuth().data?.user;
  return user ? can(user.role, resource, write) : false;
}
