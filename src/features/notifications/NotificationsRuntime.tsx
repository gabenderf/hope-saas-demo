import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/auth';
import { useConnectionState, useLiveEvents, useNow, useOverview } from '@/data/hooks';
import { useForecastAlerts } from '@/features/forecast/public';
import { dayBounds, todayKey } from '@/lib/time';
import { notify, resolveNotifications, setNotificationClock, setNotificationNavigator } from './notify';
import {
  connectionAlert,
  connectionRestored,
  globalGoalAlert,
  initialConnectionTracker,
  milestoneAlert,
  reachedMilestone,
  stationAlerts,
  stepConnection,
  type ConnectionTracker,
} from './rules';
import { useNotificationStore } from './store';

/**
 * Montado uma vez no shell e no Modo TV. Avalia as regras a cada minuto e a
 * cada evento ao vivo. Não renderiza nada.
 */
export function NotificationsRuntime() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const now = useNow(30_000);
  const connection = useConnectionState();
  const overview = useOverview({ range: 'hoje', compare: 'dia-util-anterior' });
  const userId = user?.id ?? 'anon';
  const tracker = useRef<ConnectionTracker>(initialConnectionTracker);
  const nowRef = useRef(now);
  const userRef = useRef(userId);

  useEffect(() => {
    nowRef.current = now;
    userRef.current = userId;
  });

  useEffect(() => {
    useNotificationStore.getState().bindUser(userId);
  }, [userId]);

  useEffect(() => {
    setNotificationClock(() => nowRef.current);
    setNotificationNavigator((href) => void navigate(href));
  }, [navigate]);

  useForecastAlerts();

  const evaluate = useCallback(() => {
    const at = nowRef.current;
    const step = stepConnection(tracker.current, connection, at.getTime());
    tracker.current = step.next;
    if (step.action === 'alert') notify(connectionAlert());
    if (step.action === 'restored') {
      resolveNotifications('conexao');
      notify(connectionRestored());
    }

    useNotificationStore.getState().expireBefore(dayBounds(todayKey(at)).start.toISOString(), at.toISOString());

    const model = overview.data;
    if (!model) return;
    for (const alert of stationAlerts(model.operators, at)) notify(alert);
    const orders = model.kpis.pedidos.value;
    const milestone = reachedMilestone(orders);
    if (milestone) notify(milestoneAlert(milestone, todayKey(at)));
  }, [connection, overview.data]);

  // a cada minuto e quando o estado muda
  useEffect(() => {
    evaluate();
    const id = window.setInterval(evaluate, 60_000);
    return () => window.clearInterval(id);
  }, [evaluate]);

  useLiveEvents((event) => {
    if (event.type === 'audit') {
      const alert = globalGoalAlert(event.entry, userRef.current === 'anon' ? null : userRef.current);
      if (alert) notify(alert);
    }
    if (event.type === 'scan' || event.type === 'connection') evaluate();
  });

  return null;
}
