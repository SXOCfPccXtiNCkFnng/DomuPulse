// Carregamento das páginas do app. Cada rota usa no próprio loading.tsx: assim
// a navegação entre páginas mostra o esqueleto na hora, abaixo do menu.
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <span className="h-10 w-56 animate-pulse rounded-xl bg-surface-2" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="h-24 animate-pulse rounded-2xl bg-surface-2" />
        ))}
      </div>
      <span className="h-96 animate-pulse rounded-card bg-surface-2" />
    </div>
  );
}
