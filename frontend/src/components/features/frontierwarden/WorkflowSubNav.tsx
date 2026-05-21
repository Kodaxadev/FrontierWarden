interface SubNavTab<T extends string> {
  id: T;
  label: string;
}

interface WorkflowSubNavProps<T extends string> {
  active: T;
  onChange: (tab: T) => void;
  tabs: SubNavTab<T>[];
}

export function WorkflowSubNav<T extends string>({
  active,
  onChange,
  tabs,
}: WorkflowSubNavProps<T>) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`c-filter${active === tab.id ? ' c-filter--active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
