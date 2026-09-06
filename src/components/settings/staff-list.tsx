'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreVertical, Plus, ShieldCheck, UserCog, UserX } from 'lucide-react';

import { api, errorMessage } from '@/lib/client-api';
import { formatDate, relativeDate } from '@/lib/utils';
import { useSession } from '@/hooks/use-session';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/misc';
import { StaffDialog } from '@/components/settings/staff-dialog';
import type { UserDTO } from '@/types';

export function StaffList() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<{ data: UserDTO[] }>('/api/users'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<UserDTO> }) =>
      api.patch<UserDTO>(`/api/users/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Staff updated');
    },
    onError: (error) => toast.error('Could not update', errorMessage(error)),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>Staff &amp; logins</CardTitle>
          <CardDescription>
            Manage who can access this system. Deactivated users keep their history.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus /> Add
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-md" />
            ))}
          </div>
        ) : (
          <ul className="divide-y">
            {(data?.data ?? []).map((member) => {
              const isSelf = member.id === user.id;
              return (
                <li key={member.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {member.name}
                      {isSelf && <span className="text-xs text-muted-foreground">(you)</span>}
                      {member.role === 'ADMIN' ? (
                        <Badge variant="default">
                          <ShieldCheck /> Admin
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Staff</Badge>
                      )}
                      {!member.isActive && <Badge variant="unpaid">Deactivated</Badge>}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">{member.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {member.lastLoginAt
                        ? `Last active ${relativeDate(member.lastLoginAt)}`
                        : `Added ${formatDate(member.createdAt)} · never signed in`}
                    </p>
                  </div>

                  {!isSelf && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Manage ${member.name}`}>
                          <MoreVertical />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            updateMutation.mutate({
                              id: member.id,
                              body: { role: member.role === 'ADMIN' ? 'STAFF' : 'ADMIN' },
                            })
                          }
                        >
                          <UserCog />
                          Make {member.role === 'ADMIN' ? 'staff' : 'admin'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          destructive={member.isActive}
                          onClick={() =>
                            updateMutation.mutate({
                              id: member.id,
                              body: { isActive: !member.isActive },
                            })
                          }
                        >
                          <UserX />
                          {member.isActive ? 'Deactivate' : 'Reactivate'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <StaffDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </Card>
  );
}
