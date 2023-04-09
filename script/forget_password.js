const newPassword = document.getElementById('new-password');
const confirmPassword = document.getElementById('confirm-password');
const error = document.getElementById('error');

function checkPasswords() {
  if (newPassword.value !== confirmPassword.value) {
    error.innerHTML = 'Passwords do not match';
    error.style.color = 'red';
    confirmPassword.setCustomValidity('Passwords do not match');
    confirmPassword.style.borderColor = 'red';
    confirmPassword.style.borderWidth = '2px';
  } else {
    error.innerHTML = '';
    confirmPassword.setCustomValidity('');
    confirmPassword.style.borderColor = '';
    confirmPassword.style.borderWidth = '';
  }
}

newPassword.addEventListener('change', checkPasswords);
confirmPassword.addEventListener('keyup', checkPasswords);
