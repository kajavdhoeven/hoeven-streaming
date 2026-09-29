/* Inloggen, registreren, wachtwoord vergeten en nieuw wachtwoord instellen. */

import { h, Scope, sleep } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { aurora } from "../ui/aurora.js";
import { toast } from "../ui/toast.js";
import { api } from "../api/index.js";
import { navigate } from "../core/router.js";
import { signIn, signUp } from "../core/session.js";

export default {
  mount(root, ctx) {
    const scope = new Scope();
    const isReset = ctx.route.name === "reset";
    let mode = isReset ? "reset" : "login"; // login | register | forgot | reset

    const wrap = h("div", { class: "auth-wrap" });
    root.appendChild(h("section", { class: "auth" }, aurora(), wrap));

    const logo = h("img", { class: "auth-logo", src: "assets/img/logo.png", alt: "Hoeven+" });

    function passwordField(id, label, autocomplete, i) {
      const input = h("input", { class: "input", id, type: "password", required: true, minLength: 6, autocomplete, placeholder: "Minimaal 6 tekens" });
      const toggle = h("button", { class: "pw-toggle", type: "button", "aria-label": "Wachtwoord tonen", onClick: () => { const show = input.type === "password"; input.type = show ? "text" : "password"; toggle.replaceChildren(icon(show ? "eye" : "eye")); toggle.style.color = show ? "#fff" : ""; } }, icon("eye"));
      return { input, el: h("div", { class: "field", style: { "--i": i } }, h("label", { for: id }, label), h("div", { class: "pw-wrap" }, input, toggle)) };
    }

    function render() {
      const card = h("div", { class: "auth-card" });
      const error = h("div", { class: "auth-error", role: "alert", hidden: true });
      const info = h("div", { class: "auth-ok", role: "status", hidden: true });
      const showError = (msg) => { error.textContent = msg; error.hidden = false; error.style.animation = "none"; void error.offsetWidth; error.style.animation = ""; };

      let head, fields = [], submitLabel, footer, onSubmit;

      if (mode === "login" || mode === "register") {
        const email = h("input", { class: "input", id: "email", type: "email", required: true, autocomplete: "email", placeholder: "naam@voorbeeld.nl", autofocus: true });
        const name = h("input", { class: "input", id: "name", type: "text", required: true, maxLength: 30, autocomplete: "given-name", placeholder: "Bijvoorbeeld Kaja" });
        const pw = passwordField("pw", "Wachtwoord", mode === "login" ? "current-password" : "new-password", mode === "login" ? 1 : 2);
        head = h("div", { class: "auth-head" },
          h("h1", null, mode === "login" ? "Welkom terug" : "Maak je account"),
          h("p", null, mode === "login" ? "Log in om verder te kijken." : "Je account wordt eerst door de beheerder goedgekeurd."));
        if (mode === "register") fields.push(h("div", { class: "field", style: { "--i": 0 } }, h("label", { for: "name" }, "Je naam"), name));
        fields.push(h("div", { class: "field", style: { "--i": mode === "login" ? 0 : 1 } }, h("label", { for: "email" }, "E-mailadres"), email), pw.el);
        submitLabel = mode === "login" ? "Inloggen" : "Account maken";
        footer = [
          mode === "login" ? h("button", { class: "auth-link", type: "button", onClick: () => { mode = "forgot"; render(); } }, "Wachtwoord vergeten?") : null,
        ];
        onSubmit = async () => {
          if (mode === "login") {
            await signIn(email.value.trim(), pw.input.value);
          } else {
            const res = await signUp(email.value.trim(), pw.input.value, name.value.trim());
            if (res.needsConfirmation) {
              info.textContent = "Bijna klaar! We hebben een e-mail gestuurd. Klik op de link in die mail om je adres te bevestigen. Daarna wordt je account door de beheerder goedgekeurd.";
              info.hidden = false;
              return "stay";
            }
          }
        };
      } else if (mode === "forgot") {
        const email = h("input", { class: "input", id: "email", type: "email", required: true, autocomplete: "email", placeholder: "naam@voorbeeld.nl", autofocus: true });
        head = h("div", { class: "auth-head" }, h("h1", null, "Wachtwoord vergeten"), h("p", null, "We sturen je een link om een nieuw wachtwoord te kiezen."));
        fields.push(h("div", { class: "field", style: { "--i": 0 } }, h("label", { for: "email" }, "E-mailadres"), email));
        submitLabel = "Stuur herstel-link";
        footer = [h("button", { class: "auth-link", type: "button", onClick: () => { mode = "login"; render(); } }, "Terug naar inloggen")];
        onSubmit = async () => {
          await api.auth.resetPassword(email.value.trim());
          info.textContent = "Gelukt! Als dit adres bij ons bekend is, ligt er zo een mail met een herstel-link in je inbox.";
          info.hidden = false;
          return "stay";
        };
      } else {
        const pw = passwordField("pw", "Nieuw wachtwoord", "new-password", 0);
        head = h("div", { class: "auth-head" }, h("h1", null, "Nieuw wachtwoord"), h("p", null, "Kies een nieuw wachtwoord voor je account."));
        fields.push(pw.el);
        submitLabel = "Wachtwoord opslaan";
        onSubmit = async () => {
          await api.auth.updatePassword(pw.input.value);
          toast("Wachtwoord gewijzigd. Je bent ingelogd.", "ok");
          return "done";
        };
      }

      const submit = h("button", { class: "btn btn-gradient btn-lg btn-block", type: "submit" }, submitLabel);
      const form = h("form", { class: "auth-form", noValidate: false, onSubmit: async (e) => {
        e.preventDefault();
        error.hidden = true; info.hidden = true;
        submit.classList.add("is-loading");
        try {
          const res = await onSubmit();
          if (res === "stay") { submit.classList.remove("is-loading"); return; }
          card.classList.add("is-leaving");
          await sleep(380);
          navigate("/profiles");
        } catch (err) {
          showError(err.message || "Er ging iets mis.");
          submit.classList.remove("is-loading");
        }
      } }, error, info, fields, submit);

      const tabs = mode === "login" || mode === "register"
        ? h("div", { class: "seg auth-seg", role: "tablist" },
          h("button", { type: "button", class: mode === "login" ? "is-active" : "", role: "tab", onClick: () => { mode = "login"; render(); } }, "Inloggen"),
          h("button", { type: "button", class: mode === "register" ? "is-active" : "", role: "tab", onClick: () => { mode = "register"; render(); } }, "Registreren"))
        : null;
      const note = mode === "register" ? h("p", { class: "auth-note" }, "Alleen familie en vrienden. Nieuwe accounts kunnen pas kijken nadat de beheerder ze heeft goedgekeurd.") : null;
      card.append(...[tabs, head, form, ...footer || [], note].filter(Boolean));
      wrap.replaceChildren(logo, card, api.mode === "demo" ? h("div", { class: "demo-chip" }, "Demo-modus: vul js/config.js in voor je echte database") : null);
      requestAnimationFrame(() => card.querySelector("input")?.focus({ preventScroll: true }));
    }

    render();
    return () => scope.dispose();
  },
};
