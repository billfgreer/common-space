import styles from './Header.module.css'

const Logo = () => (
  <div className={styles.logo}>
    <span className={styles.logoMark} aria-hidden="true" />
    Disaster Commons
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
