import { useState, useCallback } from 'react';

interface SnackbarState {
  visible: boolean;
  message: string;
  error: boolean;
}

const INITIAL: SnackbarState = { visible: false, message: '', error: false };

export function useSnackbar() {
  const [snackbar, setSnackbar] = useState<SnackbarState>(INITIAL);

  const showSuccess = useCallback((message: string) => {
    setSnackbar({ visible: true, message, error: false });
  }, []);

  const showError = useCallback((message: string) => {
    setSnackbar({ visible: true, message, error: true });
  }, []);

  const hideSnackbar = useCallback(() => {
    setSnackbar((s) => ({ ...s, visible: false }));
  }, []);

  return { snackbar, showSuccess, showError, hideSnackbar };
}
