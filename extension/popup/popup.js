// Check if backend is reachable, show iframe or offline fallback
const frame = document.getElementById('frame')
const offline = document.getElementById('offline')
const retryBtn = document.getElementById('retry-btn')

function checkConnection() {
  fetch('http://127.0.0.1:27843/api/v1/ping', { signal: AbortSignal.timeout(3000) })
    .then(r => {
      if (!r.ok) throw new Error()
      frame.style.display = 'block'
      offline.classList.remove('show')
    })
    .catch(() => {
      frame.style.display = 'none'
      offline.classList.add('show')
    })
}

retryBtn.addEventListener('click', () => location.reload())
checkConnection()
