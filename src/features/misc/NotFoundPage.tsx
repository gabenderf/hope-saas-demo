import { Search } from 'lucide-react';
import { Link } from 'react-router';
import { openPalette } from '@/components/command/palette-store';
import { Button, EmptyState } from '@/components/ui';

export default function NotFoundPage() {
  return (
    <EmptyState
      className="py-16"
      title="Página não encontrada"
      description="O endereço não existe ou a tela foi movida. Volte para a Visão Geral ou busque pelo nome da tela."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" asChild>
            <Link to="/expedicao">Voltar para a Visão Geral</Link>
          </Button>
          <Button icon={<Search />} onClick={openPalette}>
            Abrir a busca
          </Button>
        </div>
      }
    />
  );
}
