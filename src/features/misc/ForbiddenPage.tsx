import { Link } from 'react-router';
import { Button, EmptyState } from '@/components/ui';

export default function ForbiddenPage() {
  return (
    <EmptyState
      className="py-16"
      title="Sem permissão"
      description="Seu perfil não dá acesso a esta tela. Peça a um administrador."
      action={
        <Button variant="primary" asChild>
          <Link to="/expedicao">Voltar para a Visão Geral</Link>
        </Button>
      }
    />
  );
}
