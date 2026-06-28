(function () {
  "use strict";

  var firebaseApp = firebase.initializeApp(window.FIREBASE_CONFIG);
  var auth = firebase.auth();
  var db = firebase.firestore();
  var storage = firebase.storage();
  var USERS_COLLECTION = window.FIREBASE_USERS_COLLECTION || "users";
  var MEDIA_ROOT = window.WPL_MEDIA_UPLOADS_ROOT || "media_uploads";

  var SIGNUP_ALLOWED_ROLES = new Set(["athlete", "coach", "parent"]);
  var SUPPORTED_LANGS = new Set(["en", "es", "uz", "ru"]);

  function normalizeAuthRole(role) {
    var value = String(role || "").trim().toLowerCase();
    if (value === "coach") return "coach";
    if (value === "parent") return "parent";
    return "athlete";
  }

  function normalizeSignupRole(role) {
    var normalized = normalizeAuthRole(role);
    return SIGNUP_ALLOWED_ROLES.has(normalized) ? normalized : "athlete";
  }

  function getDefaultViewForRole(role) {
    var normalized = normalizeAuthRole(role);
    if (normalized === "coach") return "coach";
    if (normalized === "parent") return "parent";
    return "athlete";
  }

  function resolveLang(lang) {
    return SUPPORTED_LANGS.has(lang) ? lang : "en";
  }

  function slugifyKey(value) {
    var slug = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return slug || ("item-" + Date.now());
  }

  function stripUndefinedDeep(value) {
    if (value === undefined) return undefined;
    if (Array.isArray(value)) {
      return value.map(stripUndefinedDeep).filter(function (item) { return item !== undefined; });
    }
    if (value && typeof value === "object" && Object.prototype.toString.call(value) === "[object Object]") {
      var out = {};
      Object.keys(value).forEach(function (key) {
        var cleaned = stripUndefinedDeep(value[key]);
        if (cleaned !== undefined) out[key] = cleaned;
      });
      return out;
    }
    return value;
  }

  function toast(message, tone) {
    var el = document.getElementById("toast");
    el.textContent = message;
    el.className = "toast" + (tone ? " " + tone : "");
    el.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.add("hidden"); }, 4000);
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value : "";
  }

  function setVal(id, value) {
    var el = document.getElementById(id);
    if (el) el.value = value == null ? "" : value;
  }

  // ---------- AUTH SCREEN ----------

  var authScreen = document.getElementById("authScreen");
  var profileScreen = document.getElementById("profileScreen");
  var loginView = document.getElementById("loginView");
  var registerView = document.getElementById("registerView");

  document.getElementById("showRegisterBtn").addEventListener("click", function () {
    loginView.classList.add("hidden");
    registerView.classList.remove("hidden");
  });
  document.getElementById("showLoginBtn").addEventListener("click", function () {
    registerView.classList.add("hidden");
    loginView.classList.remove("hidden");
  });

  function updateRegisterRoleFields() {
    var role = val("rRole");
    document.querySelectorAll(".role-extra-athlete").forEach(function (el) {
      el.classList.toggle("hidden-role", role !== "athlete");
    });
    document.querySelectorAll(".role-extra-parent").forEach(function (el) {
      el.classList.toggle("hidden-role", role !== "parent");
    });
  }
  document.getElementById("rRole").addEventListener("change", updateRegisterRoleFields);
  updateRegisterRoleFields();

  document.getElementById("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var email = val("loginEmail").trim().toLowerCase();
    var password = val("loginPassword");
    auth.signInWithEmailAndPassword(email, password)
      .catch(function (err) {
        toast("No se pudo iniciar sesion: " + (err.message || err.code), "error");
      });
  });

  document.getElementById("registerForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var password = val("rPassword");
    var confirm = val("rPasswordConfirm");
    if (password !== confirm) {
      toast("Las contrasenas no coinciden.", "error");
      return;
    }
    var email = val("rEmail").trim().toLowerCase();
    var name = val("rName").trim();
    var role = normalizeSignupRole(val("rRole"));
    var lang = resolveLang(val("rLang"));
    var photo = val("rPhoto").trim();
    var athleteName = val("rParentAthleteName").trim();
    var preferredMoves = val("rPreferredMoves").trim();
    var experienceYears = val("rExperienceYears").trim();
    var stance = val("rStance");
    var weightClass = val("rWeightClass").trim();
    var notes = val("rNotes").trim();

    auth.createUserWithEmailAndPassword(email, password)
      .then(function (credential) {
        var user = credential.user;
        var now = new Date().toISOString();
        var profilePayload = {
          user_id: user.uid,
          email: email,
          name: name,
          photo: photo,
          role: role,
          view: getDefaultViewForRole(role),
          lang: lang,
          athleteName: role === "parent" ? athleteName : "",
          linkedAthleteId: (role === "parent" && athleteName)
            ? slugifyKey(athleteName)
            : (role === "athlete" ? slugifyKey(name) : ""),
          linkedAthleteUid: role === "athlete" ? user.uid : "",
          linkedCoachUid: "",
          linkedCoachName: "",
          linkedCoachEmail: "",
          status: role === "parent" ? "pending_verification" : "verified",
          preferredMoves: preferredMoves,
          preferred_moves: preferredMoves,
          experienceYears: experienceYears,
          experience_years: experienceYears,
          stance: stance,
          weightClass: weightClass,
          weight_class: weightClass,
          notes: notes,
          createdAt: now,
          updatedAt: now
        };
        return user.updateProfile({ displayName: name }).catch(function () {})
          .then(function () {
            return db.collection(USERS_COLLECTION).doc(user.uid).set(stripUndefinedDeep(profilePayload), { merge: true });
          });
      })
      .then(function () {
        toast("Cuenta creada. Bienvenido/a.", "ok");
      })
      .catch(function (err) {
        toast("No se pudo crear la cuenta: " + (err.message || err.code), "error");
      });
  });

  document.getElementById("signOutBtn").addEventListener("click", function () {
    auth.signOut();
  });

  // ---------- PROFILE SCREEN ----------

  document.querySelectorAll(".profile-subtab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var tab = btn.dataset.tab;
      document.querySelectorAll(".profile-subtab").forEach(function (b) {
        b.classList.toggle("active", b === btn);
      });
      document.querySelectorAll(".profile-subpanel").forEach(function (panel) {
        panel.classList.toggle("hidden", panel.dataset.panel !== tab);
      });
    });
  });

  var currentUid = null;
  var currentPhotoUrl = "";
  var currentProfile = null;

  function setPhotoPreview(url) {
    var img = document.getElementById("aPhotoPreview");
    var fallback = document.getElementById("aPhotoPreviewFallback");
    currentPhotoUrl = url || "";
    if (currentPhotoUrl) {
      img.src = currentPhotoUrl;
      img.hidden = false;
      fallback.hidden = true;
    } else {
      img.hidden = true;
      fallback.hidden = false;
    }
  }

  function populateAthleteProfileForm(profile) {
    var p = profile || {};
    setVal("aName", p.name);
    setVal("aRole", normalizeAuthRole(p.role));
    setVal("aAge", p.age);
    setVal("aCountry", p.country);
    setVal("aCity", p.city);
    setVal("aWeight", p.currentWeight || p.weight);
    setVal("aSchool", p.schoolName);
    setVal("aClub", p.clubName);
    setVal("aSchoolGrade", p.schoolGrade);
    setVal("aTrainingRoutines", p.trainingRoutines);
    setVal("aTrainingVolume", p.trainingVolume);
    setVal("aTrainingFocus", p.trainingFocus);
    setVal("aPreferredMoves", p.preferredMoves || p.preferred_moves);
    setVal("aStance", p.stance);
    setVal("aQuestionnaireNotes", p.questionnaireNotes || p.notes);
    var dt = p.defaultTechniques || {};
    setVal("aLeadLeg", dt.leadLeg || "left");
    setVal("aLeftAttack", dt.leftAttack);
    setVal("aRightAttack", dt.rightAttack);
    setVal("aPreferredTies", dt.preferredTies);
    setVal("aMiscNotes", dt.miscNotes);
    var challenges = p.challenges || [];
    setVal("aChallengeOne", p.challengeOne || challenges[0]);
    setVal("aChallengeTwo", p.challengeTwo || challenges[1]);
    setVal("aChallengeThree", p.challengeThree || challenges[2]);

    setVal("aStyle", p.style || "freestyle");
    setVal("aWeightClass", p.weightClass || p.weight_class);
    setVal("aYears", p.years || p.experienceYears || p.experience_years);
    setVal("aLevel", p.level || "intermediate");
    setVal("aPosition", p.position || "neutral");
    setVal("aArchetype", p.archetype);
    setVal("aBodyType", p.bodyType);
    setVal("aStrategy", p.strategy || "balanced");
    setVal("aStrategyA", p.strategyA);
    setVal("aStrategyB", p.strategyB);
    setVal("aStrategyC", p.strategyC);
    setVal("aSafeMoves", p.safeMoves);
    setVal("aRiskyMoves", p.riskyMoves);
    setVal("aResultsHistory", p.resultsHistory);
    setVal("aInternational", p.international || "no");
    setVal("aInternationalEvents", p.internationalEvents);
    setVal("aInternationalYears", p.internationalYears);
    setVal("aCoachCues", p.coachCues || "specific");
    setVal("aCueNotes", p.cueNotes);
    setVal("aInjuryNotes", p.injuryNotes);
    setVal("aTagsText", (p.tags || []).join(", "));

    setVal("aFavoritePosition", p.favoritePosition || p.position || "neutral");
    setVal("aPsychTendency", p.psychTendency || "aggressive");
    setVal("aPressureError", p.pressureError);
    setVal("aCoachSignal", p.coachSignal);
    var cueWords = p.cueWords || [];
    setVal("aCueWord1", cueWords[0]);
    setVal("aCueWord2", cueWords[1]);
    setVal("aCueWord3", cueWords[2]);
    var setups = p.setupsTop3 || [];
    setVal("aSetup1", setups[0]);
    setVal("aSetup2", setups[1]);
    setVal("aSetup3", setups[2]);
    var cues = p.cornerCoachCues || [];
    setVal("aCornerCue1", cues[0]);
    setVal("aCornerCue2", cues[1]);
    setVal("aCornerCue3", cues[2]);
    var reminders = p.mentalReminders || [];
    setVal("aMentalReminder1", reminders[0]);
    setVal("aMentalReminder2", reminders[1]);
    setVal("aMentalReminder3", reminders[2]);
    var warnings = p.safetyWarnings || [];
    setVal("aSafetyWarning1", warnings[0]);
    setVal("aSafetyWarning2", warnings[1]);
    var limitations = p.physicalLimitations || [];
    setVal("aPhysicalLimitation1", limitations[0]);
    setVal("aPhysicalLimitation2", limitations[1]);
    setVal("aCompetitionCue", p.competitionCue);
    var offense = p.offenseTop3 || [];
    setVal("aOffense1", offense[0]);
    setVal("aOffense2", offense[1]);
    setVal("aOffense3", offense[2]);
    var defense = p.defenseTop3 || [];
    setVal("aDefense1", defense[0]);
    setVal("aDefense2", defense[1]);
    setVal("aDefense3", defense[2]);

    setPhotoPreview(p.photo || "");
    document.getElementById("sessionLabel").textContent =
      (p.name || p.email || "") + " - " + normalizeAuthRole(p.role);
  }

  function readAthleteProfileForm(existing) {
    var base = existing || {};
    var tags = val("aTagsText").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    return Object.assign({}, base, {
      role: normalizeAuthRole(val("aRole")),
      name: val("aName").trim(),
      age: val("aAge").trim(),
      photo: currentPhotoUrl,
      country: val("aCountry").trim(),
      city: val("aCity").trim(),
      schoolName: val("aSchool").trim(),
      clubName: val("aClub").trim(),
      schoolGrade: val("aSchoolGrade").trim(),
      trainingRoutines: val("aTrainingRoutines").trim(),
      trainingVolume: val("aTrainingVolume").trim(),
      trainingFocus: val("aTrainingFocus").trim(),
      preferredMoves: val("aPreferredMoves").trim(),
      preferred_moves: val("aPreferredMoves").trim(),
      stance: val("aStance"),
      questionnaireNotes: val("aQuestionnaireNotes").trim(),
      style: val("aStyle") || "freestyle",
      currentWeight: val("aWeight").trim(),
      weightClass: val("aWeightClass").trim(),
      weight_class: val("aWeightClass").trim(),
      years: val("aYears").trim(),
      experienceYears: val("aYears").trim(),
      experience_years: val("aYears").trim(),
      level: val("aLevel") || "intermediate",
      position: val("aPosition") || "neutral",
      strategy: val("aStrategy") || "balanced",
      strategyA: val("aStrategyA").trim(),
      strategyB: val("aStrategyB").trim(),
      strategyC: val("aStrategyC").trim(),
      safeMoves: val("aSafeMoves").trim(),
      riskyMoves: val("aRiskyMoves").trim(),
      resultsHistory: val("aResultsHistory").trim(),
      tags: tags,
      favoritePosition: val("aFavoritePosition") || val("aPosition") || "neutral",
      psychTendency: val("aPsychTendency") || "aggressive",
      pressureError: val("aPressureError").trim(),
      coachSignal: val("aCoachSignal").trim(),
      offenseTop3: [val("aOffense1"), val("aOffense2"), val("aOffense3")].map(function (s) { return s.trim(); }).filter(Boolean),
      defenseTop3: [val("aDefense1"), val("aDefense2"), val("aDefense3")].map(function (s) { return s.trim(); }).filter(Boolean),
      international: val("aInternational") || "no",
      internationalEvents: val("aInternationalEvents").trim(),
      internationalYears: val("aInternationalYears").trim(),
      coachCues: val("aCoachCues") || "specific",
      cueNotes: val("aCueNotes").trim(),
      injuryNotes: val("aInjuryNotes").trim(),
      archetype: val("aArchetype"),
      bodyType: val("aBodyType"),
      cueWords: [val("aCueWord1"), val("aCueWord2"), val("aCueWord3")].map(function (s) { return s.trim(); }).filter(Boolean),
      challenges: [val("aChallengeOne"), val("aChallengeTwo"), val("aChallengeThree")].map(function (s) { return s.trim(); }).filter(Boolean),
      challengeOne: val("aChallengeOne").trim(),
      challengeTwo: val("aChallengeTwo").trim(),
      challengeThree: val("aChallengeThree").trim(),
      defaultTechniques: {
        leadLeg: val("aLeadLeg") || "left",
        leftAttack: val("aLeftAttack").trim(),
        rightAttack: val("aRightAttack").trim(),
        preferredTies: val("aPreferredTies").trim(),
        miscNotes: val("aMiscNotes").trim()
      },
      setupsTop3: [val("aSetup1"), val("aSetup2"), val("aSetup3")].map(function (s) { return s.trim(); }).filter(Boolean),
      cornerCoachCues: [val("aCornerCue1"), val("aCornerCue2"), val("aCornerCue3")].map(function (s) { return s.trim(); }).filter(Boolean),
      mentalReminders: [val("aMentalReminder1"), val("aMentalReminder2"), val("aMentalReminder3")].map(function (s) { return s.trim(); }).filter(Boolean),
      safetyWarnings: [val("aSafetyWarning1"), val("aSafetyWarning2")].map(function (s) { return s.trim(); }).filter(Boolean),
      physicalLimitations: [val("aPhysicalLimitation1"), val("aPhysicalLimitation2")].map(function (s) { return s.trim(); }).filter(Boolean),
      competitionCue: val("aCompetitionCue").trim()
    });
  }

  document.getElementById("athleteProfileForm").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!currentUid) return;
    var statusEl = document.getElementById("saveStatus");
    statusEl.textContent = "Guardando...";
    var payload = readAthleteProfileForm(currentProfile);
    payload.user_id = currentUid;
    payload.view = getDefaultViewForRole(payload.role);
    payload.updatedAt = new Date().toISOString();
    db.collection(USERS_COLLECTION).doc(currentUid).set(stripUndefinedDeep(payload), { merge: true })
      .then(function () {
        statusEl.textContent = "Perfil guardado.";
        toast("Perfil guardado.", "ok");
      })
      .catch(function (err) {
        statusEl.textContent = "";
        toast("No se pudo guardar: " + (err.message || err.code), "error");
      });
  });

  // ---------- PHOTO UPLOAD ----------

  document.getElementById("aPhotoChooseBtn").addEventListener("click", function () {
    document.getElementById("aPhotoFile").click();
  });

  document.getElementById("aPhotoClearBtn").addEventListener("click", function () {
    setPhotoPreview("");
    document.getElementById("aPhotoStatus").textContent = "Foto eliminada (guarda el perfil para confirmar).";
  });

  function resizeImageToBlob(file, maxSize) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var reader = new FileReader();
      reader.onload = function () {
        img.onload = function () {
          var scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          var canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          var ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(function (blob) {
            if (blob) resolve(blob);
            else reject(new Error("image_encode_failed"));
          }, "image/jpeg", 0.85);
        };
        img.onerror = function () { reject(new Error("image_load_failed")); };
        img.src = reader.result;
      };
      reader.onerror = function () { reject(new Error("file_read_failed")); };
      reader.readAsDataURL(file);
    });
  }

  document.getElementById("aPhotoFile").addEventListener("change", function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file || !currentUid) return;
    var statusEl = document.getElementById("aPhotoStatus");
    statusEl.textContent = "Subiendo foto...";
    resizeImageToBlob(file, 512)
      .then(function (blob) {
        var ref = storage.ref().child(MEDIA_ROOT + "/" + currentUid + "/profile-" + Date.now() + ".jpg");
        return ref.put(blob, { contentType: "image/jpeg" }).then(function () { return ref.getDownloadURL(); });
      })
      .then(function (url) {
        setPhotoPreview(url);
        statusEl.textContent = "Foto subida. Guarda el perfil para confirmar.";
      })
      .catch(function (err) {
        statusEl.textContent = "";
        toast("No se pudo subir la foto: " + (err.message || err.code), "error");
      });
  });

  // ---------- SESSION ----------

  auth.onAuthStateChanged(function (user) {
    if (!user) {
      currentUid = null;
      currentProfile = null;
      authScreen.classList.remove("hidden");
      profileScreen.classList.add("hidden");
      loginView.classList.remove("hidden");
      registerView.classList.add("hidden");
      return;
    }
    currentUid = user.uid;
    authScreen.classList.add("hidden");
    profileScreen.classList.remove("hidden");
    db.collection(USERS_COLLECTION).doc(user.uid).get()
      .then(function (doc) {
        currentProfile = doc.exists ? doc.data() : {
          user_id: user.uid,
          email: user.email || "",
          name: user.displayName || "",
          role: "athlete",
          view: "athlete"
        };
        populateAthleteProfileForm(currentProfile);
      })
      .catch(function (err) {
        toast("No se pudo cargar el perfil: " + (err.message || err.code), "error");
      });
  });
}());
