import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertCircle, Check, Copy, ExternalLink, Link2, Link2Off, Loader2, MessageCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useWebAuth } from '../../hooks/useWebAuth';
import { webApi } from '../../lib/webApi';

type TelegramLinkCodeResponse =
  | { linked: true; telegramUserId: string }
  | { linked: false; code: string; botUrl: string; expiresAt: string };

interface TelegramAccountLinkProps {
  ownerId: string;
}

const profileQueryKey = (ownerId: string) => ['web-account-telegram-profile', ownerId] as const;

function isCurrentOwner(ownerId: string) {
  const auth = useWebAuth.getState();
  return auth.isAuthenticated && auth.user?.id === ownerId;
}

export function TelegramAccountLink({ ownerId }: TelegramAccountLinkProps) {
  const { user, reloadProfile, unlinkTelegram } = useWebAuth();
  const { toast } = useToast();
  const [linkCode, setLinkCode] = useState<Extract<TelegramLinkCodeResponse, { linked: false }> | null>(null);
  const [pollUntil, setPollUntil] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmedLinkedId, setConfirmedLinkedId] = useState<string | null>(null);

  const profileQuery = useQuery({
    queryKey: profileQueryKey(ownerId),
    queryFn: async () => {
      const profile = await reloadProfile();
      if (!profile || profile.id !== ownerId) {
        throw new Error('Не удалось проверить Telegram для текущего аккаунта.');
      }
      return profile;
    },
    enabled: !!ownerId && isCurrentOwner(ownerId),
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    staleTime: 0,
    retry: false,
    refetchInterval: (query) => {
      if (!pollUntil || Date.now() >= pollUntil || !isCurrentOwner(ownerId)) return false;
      return query.state.data?.telegramUserId ? false : 4000;
    },
  });

  useEffect(() => {
    setConfirmedLinkedId(null);
    if (profileQuery.data?.telegramUserId) {
      setLinkCode(null);
      setPollUntil(null);
    }
  }, [profileQuery.dataUpdatedAt]);

  useEffect(() => {
    if (!pollUntil) return;
    const remaining = Math.max(0, pollUntil - Date.now());
    const timer = window.setTimeout(() => setPollUntil(null), remaining);
    return () => window.clearTimeout(timer);
  }, [pollUntil]);

  const codeMutation = useMutation({
    mutationFn: () => webApi.get<TelegramLinkCodeResponse>('/auth/telegram-link-code'),
  });

  const unlinkMutation = useMutation({
    mutationFn: () => unlinkTelegram(),
  });

  const verifiedTelegramId = profileQuery.data?.telegramUserId;
  const isVerifiedLinked = !!verifiedTelegramId || !!confirmedLinkedId;
  const knownLinkedId = user?.id === ownerId ? user.telegramUserId : undefined;
  const displayTelegramId = verifiedTelegramId || confirmedLinkedId || (profileQuery.isError ? knownLinkedId : undefined);
  const isChecking = profileQuery.isPending;
  const profileConfirmsLink = !confirmedLinkedId || verifiedTelegramId === confirmedLinkedId;
  const canAct = profileQuery.isSuccess && !profileQuery.isFetching && profileConfirmsLink && isCurrentOwner(ownerId);

  const handleConnect = async () => {
    if (!canAct || !isCurrentOwner(ownerId)) return;
    setActionError(null);
    try {
      const response = await codeMutation.mutateAsync();
      if (!isCurrentOwner(ownerId)) return;
      if (response.linked) {
        setLinkCode(null);
        setPollUntil(null);
        setConfirmedLinkedId(response.telegramUserId);
        await profileQuery.refetch();
        return;
      }
      setLinkCode(response);
      setPollUntil(Math.min(Date.now() + 10 * 60 * 1000, new Date(response.expiresAt).getTime()));
    } catch (error) {
      if (!isCurrentOwner(ownerId)) return;
      setActionError(error instanceof Error ? error.message : 'Не удалось начать привязку Telegram.');
    }
  };

  const handleUnlink = async () => {
    if (!canAct || !isCurrentOwner(ownerId)) return;
    if (!window.confirm('Отвязать Telegram от аккаунта?')) return;
    setActionError(null);
    try {
      await unlinkMutation.mutateAsync();
      if (!isCurrentOwner(ownerId)) return;
      setLinkCode(null);
      setPollUntil(null);
      setConfirmedLinkedId(null);
      toast({ title: 'Telegram отвязан' });
      const refreshed = await profileQuery.refetch();
      if (isCurrentOwner(ownerId) && refreshed.isError) {
        setActionError('Telegram отвязан, но не удалось обновить профиль. Повторите проверку.');
      }
    } catch (error) {
      if (!isCurrentOwner(ownerId)) return;
      setActionError(error instanceof Error ? error.message : 'Не удалось отвязать Telegram.');
    }
  };

  const handleCopy = async (text: string) => {
    if (!isCurrentOwner(ownerId)) return;
    try {
      await navigator.clipboard.writeText(text);
      if (isCurrentOwner(ownerId)) toast({ title: 'Скопировано' });
    } catch {
      if (isCurrentOwner(ownerId)) setActionError('Не удалось скопировать команду. Скопируйте её вручную.');
    }
  };

  const showLinked = isVerifiedLinked || (!!displayTelegramId && profileQuery.isError);

  return (
    <section className="bg-white rounded-xl border border-neutral-200 p-6" aria-labelledby="telegram-account-title">
      <h2 id="telegram-account-title" className="font-semibold text-neutral-900 mb-1 flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-blue-500" /> Telegram аккаунт
      </h2>
      <p className="text-sm text-neutral-500 mb-4">
        Привязка аккаунта Telegram к личному кабинету.
      </p>

      {isChecking ? (
        <div className="flex items-center gap-2 rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-500" role="status">
          <Loader2 className="w-4 h-4 animate-spin" /> Проверяем подключение Telegram…
        </div>
      ) : profileQuery.isError ? (
        <div className="space-y-3">
          {showLinked && (
            <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5 text-sm text-blue-800">
              <MessageCircle className="w-4 h-4 shrink-0" />
              Telegram подключён{displayTelegramId ? ` · ID: ${displayTelegramId}` : ''}
            </div>
          )}
          <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3" role="alert">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Не удалось проверить состояние Telegram. Действия временно недоступны.</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => profileQuery.refetch()}>
            Повторить проверку
          </Button>
        </div>
      ) : isVerifiedLinked ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <MessageCircle className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-900">Telegram подключён</p>
                <p className="text-xs text-neutral-500">ID: {displayTelegramId}</p>
              </div>
              <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">Подключён</Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200"
              onClick={handleUnlink}
              disabled={!canAct || unlinkMutation.isPending}
              data-testid="button-unlink-telegram"
            >
              {unlinkMutation.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <><Link2Off className="w-4 h-4 mr-1.5" /> Отвязать</>}
            </Button>
          </div>
          <p className="text-sm text-neutral-500">Повторная привязка не требуется.</p>
          {confirmedLinkedId && verifiedTelegramId !== confirmedLinkedId && (
            <p className="text-sm text-amber-800" role="status">
              Обновляем данные профиля; действия пока недоступны.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {linkCode ? (
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                <p className="text-sm text-blue-800 font-medium">Как привязать:</p>
                <ol className="text-sm text-blue-700 space-y-1.5 list-decimal list-inside">
                  <li>Откройте нашего Telegram-бота</li>
                  <li>Нажмите START или отправьте команду ниже</li>
                  <li>После привязки аккаунт появится здесь автоматически</li>
                </ol>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-white border border-blue-200 rounded px-3 py-1.5 text-xs font-mono text-blue-900 truncate">
                    /start link_{linkCode.code}
                  </code>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 shrink-0 border-blue-200"
                    onClick={() => handleCopy(`/start link_${linkCode.code}`)}
                    data-testid="button-copy-link-code"
                    aria-label="Скопировать команду привязки"
                  >
                    <Copy className="w-3.5 h-3.5 text-blue-600" />
                  </Button>
                </div>
              </div>
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => {
                  if (isCurrentOwner(ownerId)) window.open(linkCode.botUrl, '_blank', 'noopener,noreferrer');
                }}
                data-testid="button-open-telegram-bot"
              >
                <ExternalLink className="w-4 h-4 mr-2" /> Открыть бота в Telegram
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              className="border-blue-200 text-blue-700 hover:bg-blue-50"
              onClick={handleConnect}
              disabled={!canAct || codeMutation.isPending}
              data-testid="button-get-link-code"
            >
              {codeMutation.isPending
                ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                : <Link2 className="w-4 h-4 mr-2" />}
              Привязать Telegram
            </Button>
          )}

          {linkCode && pollUntil && (
            <p className="flex items-center gap-1.5 text-xs text-neutral-500">
              <Check className="w-3.5 h-3.5 text-blue-600" /> Проверяем подключение автоматически.
            </p>
          )}
          {linkCode && !pollUntil && (
            <Button variant="outline" size="sm" onClick={handleConnect} disabled={!canAct || codeMutation.isPending}>
              {codeMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Получить новый код
            </Button>
          )}
        </div>
      )}

      {actionError && (
        <p className="mt-3 flex items-start gap-2 text-sm text-red-700" role="alert">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {actionError}
        </p>
      )}
    </section>
  );
}
