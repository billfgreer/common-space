import styles from './Header.module.css'

const Logo = () => (
  <div className={styles.logo}>
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="8" stroke="#0AAFB8" strokeWidth="1.5"/>
      <ellipse cx="10" cy="10" rx="4.5" ry="8" stroke="#0AAFB8" strokeWidth="1.5"/>
      <line x1="2" y1="10" x2="18" y2="10" stroke="#0AAFB8" strokeWidth="1.5"/>
    </svg>
    Common Space
  </div>
)

const ChevronLeft = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)

export default function Header({ event, onBack, backLabel = 'All Events', onHome }) {
  return (
    <header className={styles.header}>
      {onHome
        ? <button className={styles.logoBtn} onClick={onHome}><Logo /></button>
        : <Logo />
      }
      {event && (
        <>
          <div className={styles.divider} />
          {event.name && <span className={styles.eventName}>{event.name}</span>}
        </>
      )}
      <div className={styles.spacer} />
      {onBack && (
        <button className="btn-back" onClick={onBack}>
          <ChevronLeft />
          {backLabel}
        </button>
      )}
    </header>
  )
}
