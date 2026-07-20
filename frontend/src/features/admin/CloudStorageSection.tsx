import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PasswordInput,
  Select,
  Spinner,
} from '@/components/ui';
import { t } from '@/i18n';
import { STORAGE_PROVIDERS, STORAGE_PROVIDER_LABEL, StorageProvider } from '@/types/enums';
import type { StorageSettings } from '@/types/dto';
import {
  useSettings,
  useTestStorageConnection,
  useUpdateStorage,
  type UpdateStoragePayload,
} from '@/features/settings/api';

/** Masked settings → an editable form. Secrets come back blank (write-only). */
function toForm(s: StorageSettings): UpdateStoragePayload {
  return {
    provider: s.provider,
    s3Region: s.s3Region ?? '',
    s3Bucket: s.s3Bucket ?? '',
    s3AccessKeyId: s.s3AccessKeyId ?? '',
    s3SecretAccessKey: '',
    s3Endpoint: s.s3Endpoint ?? '',
    s3PublicBaseUrl: s.s3PublicBaseUrl ?? '',
    azureConnectionString: '',
    azureContainer: s.azureContainer ?? '',
    maxVideoMb: s.maxVideoMb,
    maxImageMb: s.maxImageMb,
  };
}

/**
 * Configure where uploaded images + short videos are stored (AWS S3 or Azure
 * Blob). Secret keys are write-only — the API returns only whether one is set,
 * so a blank secret on save keeps the stored value.
 */
export function CloudStorageSection() {
  const { data, isLoading } = useSettings();
  const save = useUpdateStorage();
  const test = useTestStorageConnection();
  const [form, setForm] = useState<UpdateStoragePayload>({ provider: StorageProvider.NONE });

  useEffect(() => {
    if (data?.storage) setForm(toForm(data.storage));
  }, [data]);

  const stored = data?.storage;
  const set = (patch: Partial<UpdateStoragePayload>) => setForm((f) => ({ ...f, ...patch }));
  const isS3 = form.provider === StorageProvider.S3;
  const isAzure = form.provider === StorageProvider.AZURE;
  const configured = form.provider !== StorageProvider.NONE;

  function onSave() {
    save.mutate(form, {
      onSuccess: () => toast.success(t('settings.storageSaved')),
      onError: (e) => toast.error((e as Error).message),
    });
  }
  function onTest() {
    test.mutate(form, {
      onSuccess: () => toast.success(t('settings.storageTestOk')),
      onError: (e) => toast.error((e as Error).message),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.storage')}</CardTitle>
        <CardDescription>{t('settings.storageHint')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="grid place-items-center rounded-xl border border-dashed p-8">
            <Spinner />
          </div>
        ) : (
          <>
            <Field label={t('settings.storageProvider')} htmlFor="st-provider">
              <Select
                id="st-provider"
                value={form.provider}
                onValueChange={(v) => set({ provider: v as StorageProvider })}
                options={STORAGE_PROVIDERS.map((p) => ({
                  value: p,
                  label: STORAGE_PROVIDER_LABEL[p],
                }))}
              />
            </Field>

            {isS3 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('settings.storageS3Bucket')} htmlFor="st-bucket">
                  <Input
                    id="st-bucket"
                    value={form.s3Bucket ?? ''}
                    onChange={(e) => set({ s3Bucket: e.target.value })}
                    placeholder="my-bucket"
                  />
                </Field>
                <Field label={t('settings.storageS3Region')} htmlFor="st-region">
                  <Input
                    id="st-region"
                    value={form.s3Region ?? ''}
                    onChange={(e) => set({ s3Region: e.target.value })}
                    placeholder="ap-southeast-1"
                  />
                </Field>
                <Field label={t('settings.storageS3Key')} htmlFor="st-key">
                  <Input
                    id="st-key"
                    autoComplete="off"
                    value={form.s3AccessKeyId ?? ''}
                    onChange={(e) => set({ s3AccessKeyId: e.target.value })}
                  />
                </Field>
                <Field label={t('settings.storageS3Secret')} htmlFor="st-secret">
                  <PasswordInput
                    id="st-secret"
                    autoComplete="new-password"
                    placeholder={stored?.s3SecretConfigured ? '••••••••' : ''}
                    value={form.s3SecretAccessKey ?? ''}
                    onChange={(e) => set({ s3SecretAccessKey: e.target.value })}
                  />
                  {stored?.s3SecretConfigured && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('settings.storageSecretKept')}
                    </p>
                  )}
                </Field>
                <Field label={t('settings.storageS3Endpoint')} htmlFor="st-endpoint">
                  <Input
                    id="st-endpoint"
                    value={form.s3Endpoint ?? ''}
                    onChange={(e) => set({ s3Endpoint: e.target.value })}
                    placeholder="https://s3.example.com"
                  />
                </Field>
                <Field label={t('settings.storageS3PublicUrl')} htmlFor="st-pub">
                  <Input
                    id="st-pub"
                    value={form.s3PublicBaseUrl ?? ''}
                    onChange={(e) => set({ s3PublicBaseUrl: e.target.value })}
                    placeholder="https://cdn.example.com"
                  />
                </Field>
              </div>
            )}

            {isAzure && (
              <div className="space-y-4">
                <Field label={t('settings.storageAzureContainer')} htmlFor="st-container">
                  <Input
                    id="st-container"
                    value={form.azureContainer ?? ''}
                    onChange={(e) => set({ azureContainer: e.target.value })}
                    placeholder="media"
                  />
                </Field>
                <Field label={t('settings.storageAzureConnection')} htmlFor="st-conn">
                  <PasswordInput
                    id="st-conn"
                    autoComplete="new-password"
                    placeholder={
                      stored?.azureConnectionConfigured ? '••••••••' : 'DefaultEndpointsProtocol=…'
                    }
                    value={form.azureConnectionString ?? ''}
                    onChange={(e) => set({ azureConnectionString: e.target.value })}
                  />
                  {stored?.azureConnectionConfigured && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('settings.storageSecretKept')}
                    </p>
                  )}
                </Field>
              </div>
            )}

            {configured && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('settings.storageMaxVideo')} htmlFor="st-maxvideo">
                  <Input
                    id="st-maxvideo"
                    type="number"
                    min={1}
                    max={2000}
                    value={form.maxVideoMb ?? 30}
                    onChange={(e) => set({ maxVideoMb: Number(e.target.value) || undefined })}
                  />
                </Field>
                <Field label={t('settings.storageMaxImage')} htmlFor="st-maximage">
                  <Input
                    id="st-maximage"
                    type="number"
                    min={1}
                    max={2000}
                    value={form.maxImageMb ?? 10}
                    onChange={(e) => set({ maxImageMb: Number(e.target.value) || undefined })}
                  />
                </Field>
              </div>
            )}
          </>
        )}
      </CardContent>
      <CardFooter className="justify-end gap-2">
        {configured && (
          <Button
            variant="secondary"
            onClick={onTest}
            loading={test.isPending}
            disabled={save.isPending}
          >
            {t('settings.storageTest')}
          </Button>
        )}
        <Button onClick={onSave} loading={save.isPending} disabled={test.isPending}>
          {t('common.save')}
        </Button>
      </CardFooter>
    </Card>
  );
}
