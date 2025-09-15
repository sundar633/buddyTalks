
const SUPABASE_URL = 'https://cmppzwvcgkmnesnaagyu.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtcHB6d3ZjZ2ttbmVzbmFhZ3l1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MzE0MDcsImV4cCI6MjA3MzAwNzQwN30.fDidGQtnIlqpbq_XkWe8cxRbPOeaMqS0Sh7X7qbuDGQ'; 
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const authForm = document.getElementById('authForm');
const toggleLink = document.getElementById('toggleLink');
const formTitle = document.getElementById('form-title');
const submitBtn = document.getElementById('submitBtn');
const confirmPassword = document.getElementById('confirmPassword');
const nameField = document.getElementById('name');
const spinner = document.getElementById('spinner');
const messageBox = document.getElementById('messageBox');
const messageText = document.getElementById('messageText');

let isLogin = true;

// Toggle login/signup
toggleLink.addEventListener('click', () => {
  isLogin = !isLogin;
  if (isLogin) {
    formTitle.textContent = "Login to your account";
    submitBtn.textContent = "Login";
    toggleLink.textContent = "Sign Up";
    document.getElementById('toggleMessage').textContent = "Don't have an account?";
    confirmPassword.style.display = "none";
    confirmPassword.removeAttribute('required');
    nameField.style.display = "none";
    nameField.removeAttribute('required');
  } else {
    formTitle.textContent = "Sign Up for BuddyTalks";
    submitBtn.textContent = "Sign Up";
    toggleLink.textContent = "Login";
    document.getElementById('toggleMessage').textContent = "Already have an account?";
    confirmPassword.style.display = "block";
    confirmPassword.setAttribute('required', 'required');
    nameField.style.display = "block";
    nameField.setAttribute('required', 'required');
  }
});

// Form submission
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = nameField.value.trim();
  const mobile = document.getElementById('mobile').value.trim();
  const password = document.getElementById('password').value;
  const confirmPass = confirmPassword.value;

  // Mobile number validation
  if (!/^\d{10}$/.test(mobile)) {
    messageText.textContent = "Mobile number must be 10 digits!";
    messageBox.classList.remove('hidden');
    setTimeout(() => messageBox.classList.add('hidden'), 2000);
    return;
  }

  if (!isLogin) {
    if (name.length === 0) {
      messageText.textContent = "Name is required!";
      messageBox.classList.remove('hidden');
      setTimeout(() => messageBox.classList.add('hidden'), 2000);
      return;
    }
    // Signup: Check password match
    if (password !== confirmPass) {
      messageText.textContent = "Passwords do not match!";
      messageBox.classList.remove('hidden');
      setTimeout(() => messageBox.classList.add('hidden'), 2000);
      return;
    }
  }

  // Combine mobile + password (for DB storage)
  const combined = mobile + password;

if (isLogin) {
  spinner.classList.remove('hidden');
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('mobile', mobile)
      .eq('password', combined)
      .single();

    spinner.classList.add('hidden');

    if (error || !user) {
      messageText.textContent = "Invalid mobile or password";
      messageBox.classList.remove('hidden');
      setTimeout(() => messageBox.classList.add('hidden'), 2000);
      return;
    }

    // ✅ Store user info in localStorage
    localStorage.setItem('name', user.name);
    localStorage.setItem('mobile', user.mobile);

    messageText.textContent = "Login successful!";
    messageBox.classList.remove('hidden');

    // Redirect to main.html after 2 seconds
    setTimeout(() => {
      window.location.href = 'main/main.html';
    }, 2000);

  } catch (error) {
    spinner.classList.add('hidden');
    messageText.textContent = "Error: " + error.message;
    messageBox.classList.remove('hidden');
    setTimeout(() => messageBox.classList.add('hidden'), 2000);
  }
}

  else {
    spinner.classList.remove('hidden');
    try {
      const { data: existingUser } = await supabase
        .from('users')
        .select('*')
        .eq('mobile', mobile)
        .single();

      if (existingUser) {
        spinner.classList.add('hidden');
        messageText.textContent = "Mobile number already registered!";
        messageBox.classList.remove('hidden');
        setTimeout(() => messageBox.classList.add('hidden'), 2000);
        return;
      }

      const { error: insertError } = await supabase
        .from('users')
        .insert([{ name: name, mobile: mobile, password: combined }]);

      spinner.classList.add('hidden');

      if (insertError) {
        messageText.textContent = "Signup failed: " + insertError.message;
        messageBox.classList.remove('hidden');
        setTimeout(() => messageBox.classList.add('hidden'), 2000);
        return;
      }

      messageText.textContent = "Signup successful!";
      messageBox.classList.remove('hidden');

      setTimeout(() => {
        messageBox.classList.add('hidden');
        toggleLink.click(); // Switch to login
        authForm.reset();
      }, 2000);

    } catch (error) {
      spinner.classList.add('hidden');
      messageText.textContent = "Error: " + error.message;
      messageBox.classList.remove('hidden');
      setTimeout(() => messageBox.classList.add('hidden'), 2000);
    }
  }
});

window.addEventListener('load', () => {
  const splash = document.getElementById('splashScreen');
  const container = document.querySelector('.container');

  // Hide login container initially
  container.style.display = 'none';

  // Show splash for 2.5s then fade out
  setTimeout(() => {
    splash.style.transition = 'opacity 0.5s';
    splash.style.opacity = 0;

    setTimeout(() => {
      splash.style.display = 'none';      // hide splash
      container.style.display = 'block';  // show login container
      setTimeout(() => container.classList.add('show'), 50); // fade-in effect
      document.body.style.overflow = 'auto'; // enable scrolling
    }, 500);
  }, 2500);
});
window.addEventListener('load', () => {
  const headings = document.querySelectorAll('#headingContainer h2');
  let current = 0;
  const fadeDuration = 600;  // match transition time
  const displayDuration = 2000;

  // Ensure only the first heading is visible initially
  headings.forEach((h, i) => {
    h.style.display = i === 0 ? 'block' : 'none';
    h.classList.remove('slide-fade-in', 'slide-fade-out');
    h.classList.add(i === 0 ? 'slide-fade-in' : 'slide-fade-out');
  });

  function showNextHeading() {
    // Fade out current
    headings[current].classList.remove('slide-fade-in');
    headings[current].classList.add('slide-fade-out');

    setTimeout(() => {
      headings[current].style.display = 'none';

      // Move to next heading
      current = (current + 1) % headings.length;

      headings[current].style.display = 'block';
      void headings[current].offsetWidth;

      headings[current].classList.remove('slide-fade-out');
      headings[current].classList.add('slide-fade-in');
    }, fadeDuration);
  }

  // Start interval loop
  setInterval(showNextHeading, fadeDuration + displayDuration);
});

