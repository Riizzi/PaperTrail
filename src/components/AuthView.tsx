import React, { useState, useEffect } from 'react';
import {
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  checkRedirectAuth,
} from '../services/firebase';
import { BookOpen, LogIn, UserPlus, Loader2 } from 'lucide-react';

interface AuthViewProps {
  onToast: (msg: string) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onToast }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if returning from signInWithRedirect
    checkRedirectAuth().then((user) => {
      if (user) {
        onToast('Login realizado com sucesso');
      }
    });
  }, [onToast]);

  const translateAuthError = (err: any): string => {
    const code = err.code || '';
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
      return 'E-mail ou senha incorretos.';
    }
    if (code === 'auth/email-already-in-use') {
      return 'Este e-mail já está em uso por outra conta.';
    }
    if (code === 'auth/weak-password') {
      return 'A senha deve conter pelo menos 6 caracteres.';
    }
    if (code === 'auth/unauthorized-domain') {
      return 'este endereço do app não está autorizado no Firebase.';
    }
    if (code === 'auth/operation-not-allowed') {
      return 'este método de login não está ativado no Firebase.';
    }
    if (code === 'auth/cancelled-popup-request') {
      return 'outra janela de login já estava aberta.';
    }
    if (code === 'auth/popup-blocked') {
      return 'O navegador bloqueou a janela de autenticação. Sugerimos entrar com e-mail e senha.';
    }
    if (code === 'auth/popup-closed-by-user') {
      return 'A janela de autenticação foi fechada antes de concluir.';
    }
    if (code === 'auth/network-request-failed') {
      return 'Falha na conexão de rede. Verifique seu acesso à internet.';
    }
    return err.message || 'Erro na autenticação. Tente novamente.';
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      onToast('Login realizado com Google');
    } catch (err: any) {
      console.error(err);
      const reason = translateAuthError(err);
      const code = err?.code ? ` (${err.code})` : '';
      setError(`Não foi possível entrar com Google: ${reason}${code}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Preencha o e-mail e a senha.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (mode === 'login') {
        await signInWithEmail(email.trim(), password);
        onToast('Sessão iniciada');
      } else {
        await signUpWithEmail(email.trim(), password);
        onToast('Conta criada com sucesso');
      }
    } catch (err: any) {
      console.error(err);
      setError(translateAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow-md p-6 space-y-6">
        {/* Brand header */}
        <div className="text-center space-y-1.5 border-b border-[#E8DFD1] pb-4">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-[#FAF7F2] border border-[#E8DFD1] ledger-shadow-sm mb-1">
            <BookOpen size={22} strokeWidth={1.8} className="text-[#292524]" />
          </div>
          <h1 className="font-mono text-xl font-bold tracking-tight text-[#292524]">
            PaperTrail
          </h1>
          <p className="font-mono text-[11px] text-[#78716C]">
            Gerenciador de referências acadêmicas
          </p>
        </div>

        {error && (
          <div className="p-2.5 bg-[#FFF5F5] border border-[#FCA5A5] text-[#991B1B] text-xs font-mono leading-relaxed">
            {error}
          </div>
        )}

        {/* Google Login button */}
        <button
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className="w-full ledger-btn py-2.5 text-xs font-mono flex items-center justify-center gap-2 bg-[#FAF7F2] hover:bg-[#F2ECE1]"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Continuar com o Google</span>
        </button>

        {/* Divider */}
        <div className="relative flex items-center justify-center">
          <div className="border-t border-[#E8DFD1] w-full" />
          <span className="bg-[#FFFDF9] px-2 text-[10px] font-mono text-[#A8A29E] uppercase tracking-wider absolute">
            ou com e-mail
          </span>
        </div>

        {/* Email form */}
        <form onSubmit={handleEmailAuth} className="space-y-3 text-xs">
          <div>
            <label className="block text-[#57534E] mb-1 font-mono text-[11px]">
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2.5 font-mono text-xs focus:outline-none focus:border-[#292524]"
              required
            />
          </div>

          <div>
            <label className="block text-[#57534E] mb-1 font-mono text-[11px]">
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2.5 font-mono text-xs focus:outline-none focus:border-[#292524]"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full ledger-btn-primary py-2.5 text-xs font-mono flex items-center justify-center gap-1.5"
          >
            {isLoading ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Processando...</span>
              </>
            ) : mode === 'login' ? (
              <>
                <LogIn size={13} />
                <span>Entrar na biblioteca</span>
              </>
            ) : (
              <>
                <UserPlus size={13} />
                <span>Cadastrar nova conta</span>
              </>
            )}
          </button>
        </form>

        {/* Mode switch */}
        <div className="text-center pt-2 border-t border-[#E8DFD1] text-[11px] font-mono">
          {mode === 'login' ? (
            <p className="text-[#78716C]">
              Não possui conta?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className="text-[#292524] font-bold hover:underline"
              >
                Cadastre-se
              </button>
            </p>
          ) : (
            <p className="text-[#78716C]">
              Já possui conta?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className="text-[#292524] font-bold hover:underline"
              >
                Faça login
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
