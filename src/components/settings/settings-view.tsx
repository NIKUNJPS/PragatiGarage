'use client';

import { useQuery } from '@tanstack/react-query';

import { api, errorMessage } from '@/lib/client-api';
import { Card } from '@/components/ui/card';
import { ErrorState, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { PageHeader } from '@/components/shared/page-header';
import { GarageSettingsForm } from '@/components/settings/garage-settings-form';
import { ChangePasswordForm } from '@/components/settings/change-password-form';
import type { GarageDTO } from '@/types';

/**
 * Single-login app: Settings covers the garage profile and the owner's own
 * account (change password). There is no staff/multi-user management.
 */
export function SettingsView() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['garage-settings'],
    queryFn: () => api.get<GarageDTO>('/api/garage'),
  });

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your garage profile, invoice numbering and your password."
      />

      <Tabs defaultValue="business">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="business" className="flex-1 sm:flex-none">
            Garage
          </TabsTrigger>
          <TabsTrigger value="account" className="flex-1 sm:flex-none">
            Account &amp; Password
          </TabsTrigger>
        </TabsList>

        <TabsContent value="business">
          {isLoading ? (
            <Skeleton className="h-96 rounded-lg" />
          ) : isError || !data ? (
            <Card>
              <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
            </Card>
          ) : (
            <GarageSettingsForm garage={data} onSaved={() => void refetch()} />
          )}
        </TabsContent>

        <TabsContent value="account">
          <ChangePasswordForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
