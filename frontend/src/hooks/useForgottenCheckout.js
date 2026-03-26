import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import useAuthStore from '../stores/useAuthStore';

export default function useForgottenCheckout() {
  const user = useAuthStore((s) => s.user);
  const [forgotten, setForgotten] = useState(null); // null = loading, false = no, object = yes

  const check = useCallback(async () => {
    if (!user) { setForgotten(false); return; }
    try {
      const result = await api('/api/timer/forgotten-checkout');
      if (result.forgotten) {
        setForgotten(result);
      } else {
        setForgotten(false);
      }
    } catch {
      setForgotten(false);
    }
  }, [user]);

  useEffect(() => { check(); }, [check]);

  const finalize = async (correctedEndTime) => {
    const result = await api('/api/timer/forgotten-checkout/finalize', {
      method: 'POST',
      body: JSON.stringify({ correctedEndTime }),
    });
    setForgotten(false);
    return result;
  };

  const discard = async () => {
    const result = await api('/api/timer/forgotten-checkout/discard', {
      method: 'POST',
    });
    setForgotten(false);
    return result;
  };

  return { forgotten, check, finalize, discard };
}
