(function () {
  "use strict";

  // ---------- I18N (UI language switcher: English default, Spanish via flag toggle) ----------

  var LANG_STORAGE_KEY = "wpl_ui_lang";
  var currentLang = "en";
  try {
    var storedLang = localStorage.getItem(LANG_STORAGE_KEY);
    if (storedLang === "es" || storedLang === "en") currentLang = storedLang;
  } catch (e) {}

  var I18N = window.WPL_I18N;

  function t(key) {
    var dict = (I18N && I18N[currentLang]) || (I18N && I18N.en) || {};
    if (dict[key] !== undefined) return dict[key];
    var fallback = I18N && I18N.en;
    return (fallback && fallback[key] !== undefined) ? fallback[key] : key;
  }

  function applyStaticTranslations() {
    document.documentElement.lang = currentLang;
    document.title = t("page_title");
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
    });
    document.querySelectorAll("[data-i18n-alt]").forEach(function (el) {
      el.alt = t(el.getAttribute("data-i18n-alt"));
    });
  }

  function setLanguage(lang) {
    currentLang = lang === "es" ? "es" : "en";
    try { localStorage.setItem(LANG_STORAGE_KEY, currentLang); } catch (e) {}
    document.querySelectorAll(".lang-btn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-lang") === currentLang);
    });
    applyStaticTranslations();
    if (typeof window.WPL_onLanguageChange === "function") window.WPL_onLanguageChange();
  }

  document.querySelectorAll(".lang-btn").forEach(function (btn) {
    btn.classList.toggle("active", btn.getAttribute("data-lang") === currentLang);
    btn.addEventListener("click", function () { setLanguage(btn.getAttribute("data-lang")); });
  });
  applyStaticTranslations();

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
        toast(t("toast_login_failed") + (err.message || err.code), "error");
      });
  });

  document.getElementById("registerForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var password = val("rPassword");
    var confirm = val("rPasswordConfirm");
    if (password !== confirm) {
      toast(t("toast_passwords_no_match"), "error");
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
        toast(t("toast_account_created"), "ok");
      })
      .catch(function (err) {
        toast(t("toast_account_create_failed") + (err.message || err.code), "error");
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
  var currentProfileDocId = null;
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

    setVal("aCampEnjoyed", p.campEnjoyed);
    setVal("aCampOverallRating", p.campOverallRating);
    setVal("aCampImproved", p.campImproved);
    setVal("aCampCoachesHelpful", p.campCoachesHelpful);
    setVal("aCampOvernightGood", p.campOvernightGood);
    setVal("aCampFoodSleepRating", p.campFoodSleepRating);
    setVal("aCampFavoritePart", p.campFavoritePart);
    setVal("aCampChangeNote", p.campChangeNote);
    setVal("aCampWouldReturn", p.campWouldReturn);
    setVal("aCampWouldRecommend", p.campWouldRecommend);
    setVal("aCampMotivation", p.campMotivation);

    setPhotoPreview(p.photo || "");
    document.getElementById("sessionLabel").textContent =
      (p.name || p.email || "") + " - " + t("opt_" + normalizeAuthRole(p.role));
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
      competitionCue: val("aCompetitionCue").trim(),
      campEnjoyed: val("aCampEnjoyed"),
      campOverallRating: val("aCampOverallRating"),
      campImproved: val("aCampImproved"),
      campCoachesHelpful: val("aCampCoachesHelpful"),
      campOvernightGood: val("aCampOvernightGood"),
      campFoodSleepRating: val("aCampFoodSleepRating"),
      campFavoritePart: val("aCampFavoritePart").trim(),
      campChangeNote: val("aCampChangeNote").trim(),
      campWouldReturn: val("aCampWouldReturn"),
      campWouldRecommend: val("aCampWouldRecommend"),
      campMotivation: val("aCampMotivation")
    });
  }

  document.getElementById("athleteProfileForm").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!currentUid) return;
    var statusEl = document.getElementById("saveStatus");
    statusEl.textContent = t("status_saving");
    var payload = readAthleteProfileForm(currentProfile);
    payload.user_id = currentUid;
    payload.view = getDefaultViewForRole(payload.role);
    payload.updatedAt = new Date().toISOString();
    db.collection(USERS_COLLECTION).doc(currentProfileDocId || currentUid).set(stripUndefinedDeep(payload), { merge: true })
      .then(function () {
        statusEl.textContent = t("status_profile_saved");
        toast(t("toast_profile_saved"), "ok");
      })
      .catch(function (err) {
        statusEl.textContent = "";
        toast(t("toast_save_failed") + (err.message || err.code), "error");
      });
  });

  // ---------- PHOTO UPLOAD ----------

  document.getElementById("aPhotoChooseBtn").addEventListener("click", function () {
    document.getElementById("aPhotoFile").click();
  });

  document.getElementById("aPhotoClearBtn").addEventListener("click", function () {
    setPhotoPreview("");
    document.getElementById("aPhotoStatus").textContent = t("photo_status_removed");
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
    statusEl.textContent = t("photo_status_uploading");
    resizeImageToBlob(file, 512)
      .then(function (blob) {
        var ref = storage.ref().child(MEDIA_ROOT + "/" + currentUid + "/profile-" + Date.now() + ".jpg");
        return ref.put(blob, { contentType: "image/jpeg" }).then(function () { return ref.getDownloadURL(); });
      })
      .then(function (url) {
        setPhotoPreview(url);
        statusEl.textContent = t("photo_status_uploaded");
      })
      .catch(function (err) {
        statusEl.textContent = "";
        toast(t("toast_photo_upload_failed") + (err.message || err.code), "error");
      });
  });

  // ---------- COACH ROSTER ----------

  var rosterCard = document.getElementById("rosterCard");
  var rosterList = document.getElementById("rosterList");
  var rosterCount = document.getElementById("rosterCount");
  var rosterSearchInput = document.getElementById("rosterSearch");
  var rosterAthletes = [];
  var expandedRosterDocId = null;

  function ratingChoices() {
    var choices = [];
    for (var i = 1; i <= 10; i++) choices.push({ value: String(i), label: String(i) });
    return choices;
  }

  function yesNoChoices() {
    return [{ value: "yes", labelKey: "opt_yes" }, { value: "no", labelKey: "opt_no" }];
  }

  function choiceLabel(choice) {
    return choice.labelKey ? t(choice.labelKey) : choice.label;
  }

  // Single source of truth for "the questionnaire": every field here counts
  // as one question toward an athlete's progress total. Keep this in sync
  // with the fields editable in the athlete profile form above. labelKey is
  // resolved via t() at render time so it follows the active UI language.
  var QUESTION_DEFS = [
    { group: "training", labelKey: "q_country", keys: ["country"] },
    { group: "training", labelKey: "q_city", keys: ["city"] },
    { group: "training", labelKey: "q_school", keys: ["schoolName"] },
    { group: "training", labelKey: "q_club", keys: ["clubName"] },
    { group: "training", labelKey: "q_school_grade", keys: ["schoolGrade"] },
    { group: "training", labelKey: "q_current_weight", keys: ["currentWeight", "weight"] },
    { group: "training", labelKey: "q_training_routines", keys: ["trainingRoutines"] },
    { group: "training", labelKey: "q_training_volume", keys: ["trainingVolume"] },
    { group: "training", labelKey: "q_training_focus", keys: ["trainingFocus"] },
    { group: "training", labelKey: "q_preferred_moves", keys: ["preferredMoves", "preferred_moves"] },
    { group: "training", labelKey: "q_stance", keys: ["stance"], choices: [
      { value: "left", labelKey: "opt_left" },
      { value: "right", labelKey: "opt_right" },
      { value: "switch", label: "Switch" }
    ] },
    { group: "training", labelKey: "q_notes_goals", keys: ["questionnaireNotes", "notes"] },
    { group: "training", labelKey: "q_tags", keys: ["tags"], isList: true },

    { group: "competition", labelKey: "q_main_style", keys: ["style"], choices: [
      { value: "freestyle", label: "Freestyle" },
      { value: "greco-roman", label: "Greco-Roman" },
      { value: "folkstyle", label: "Folkstyle" }
    ] },
    { group: "competition", labelKey: "q_weight_class", keys: ["weightClass", "weight_class"] },
    { group: "competition", labelKey: "q_experience_years", keys: ["years", "experienceYears", "experience_years"] },
    { group: "competition", labelKey: "q_level", keys: ["level"], choices: [
      { value: "beginner", labelKey: "opt_beginner" },
      { value: "intermediate", labelKey: "opt_intermediate" },
      { value: "advanced", labelKey: "opt_advanced" }
    ] },
    { group: "competition", labelKey: "q_preferred_position", keys: ["position"], choices: [
      { value: "neutral", label: "Neutral" },
      { value: "top", label: "Top" },
      { value: "bottom", label: "Bottom" }
    ] },
    { group: "competition", labelKey: "q_archetype", keys: ["archetype"], choices: [
      { value: "technician", label: "Technician" },
      { value: "scrambler", label: "Scrambler" },
      { value: "pummler", label: "Pummeler" },
      { value: "counter-wrestler", label: "Counter-wrestler" },
      { value: "chain-wrestler", label: "Chain-wrestler" }
    ] },
    { group: "competition", labelKey: "q_body_type", keys: ["bodyType"], choices: [
      { value: "compact", labelKey: "opt_body_compact" },
      { value: "long", labelKey: "opt_body_long" },
      { value: "balanced", labelKey: "opt_body_balanced" }
    ] },
    { group: "competition", labelKey: "q_strategy", keys: ["strategy"], choices: [
      { value: "balanced", labelKey: "opt_strategy_balanced" },
      { value: "offensive", labelKey: "opt_strategy_offensive" },
      { value: "defensive", labelKey: "opt_strategy_defensive" },
      { value: "counter", labelKey: "opt_strategy_counter" }
    ] },
    { group: "competition", labelKey: "q_results_history", keys: ["resultsHistory"] },
    { group: "competition", labelKey: "q_injury_notes", keys: ["injuryNotes"] },

    { group: "coaching", labelKey: "q_favorite_position", keys: ["favoritePosition"] },
    { group: "coaching", labelKey: "q_psych_tendency", keys: ["psychTendency"] },
    { group: "coaching", labelKey: "q_pressure_error", keys: ["pressureError"] },
    { group: "coaching", labelKey: "q_coach_signal", keys: ["coachSignal"] },
    { group: "coaching", labelKey: "q_keywords", keys: ["cueWords"], isList: true },
    { group: "coaching", labelKey: "q_setups", keys: ["setupsTop3"], isList: true },
    { group: "coaching", labelKey: "q_coach_cues", keys: ["cornerCoachCues"], isList: true },
    { group: "coaching", labelKey: "q_mental_reminders", keys: ["mentalReminders"], isList: true },
    { group: "coaching", labelKey: "q_safety_warnings", keys: ["safetyWarnings"], isList: true },
    { group: "coaching", labelKey: "q_physical_limitations", keys: ["physicalLimitations"], isList: true },
    { group: "coaching", labelKey: "q_offense_top3", keys: ["offenseTop3"], isList: true },
    { group: "coaching", labelKey: "q_defense_top3", keys: ["defenseTop3"], isList: true },

    { group: "camp", labelKey: "q_camp_enjoyed", keys: ["campEnjoyed"], choices: yesNoChoices() },
    { group: "camp", labelKey: "q_camp_overall_rating", keys: ["campOverallRating"], choices: ratingChoices() },
    { group: "camp", labelKey: "q_camp_improved", keys: ["campImproved"], choices: yesNoChoices() },
    { group: "camp", labelKey: "q_camp_coaches_helpful", keys: ["campCoachesHelpful"], choices: ratingChoices() },
    { group: "camp", labelKey: "q_camp_overnight_good", keys: ["campOvernightGood"], choices: yesNoChoices() },
    { group: "camp", labelKey: "q_camp_food_sleep_rating", keys: ["campFoodSleepRating"], choices: ratingChoices() },
    { group: "camp", labelKey: "q_camp_favorite_part", keys: ["campFavoritePart"] },
    { group: "camp", labelKey: "q_camp_change_note", keys: ["campChangeNote"] },
    { group: "camp", labelKey: "q_camp_would_return", keys: ["campWouldReturn"], choices: yesNoChoices() },
    { group: "camp", labelKey: "q_camp_would_recommend", keys: ["campWouldRecommend"], choices: yesNoChoices() },
    { group: "camp", labelKey: "q_camp_motivation", keys: ["campMotivation"], choices: ratingChoices() }
  ];

  var GROUP_TITLE_KEYS = { training: "group_training", competition: "group_competition", coaching: "group_coaching", camp: "group_camp" };

  function questionValue(p, def) {
    if (!p) return def.isList ? [] : "";
    for (var i = 0; i < def.keys.length; i++) {
      var v = p[def.keys[i]];
      if (Array.isArray(v)) {
        var filtered = v.filter(Boolean);
        if (filtered.length) return filtered;
      } else if (v !== undefined && v !== null && v !== "") {
        return v;
      }
    }
    return def.isList ? [] : "";
  }

  function isQuestionAnswered(p, def) {
    var v = questionValue(p, def);
    return Array.isArray(v) ? v.length > 0 : v !== "";
  }

  function questionDisplayValue(p, def) {
    var v = questionValue(p, def);
    return Array.isArray(v) ? v.join(", ") : v;
  }

  function computeProgress(p) {
    var total = QUESTION_DEFS.length;
    var answered = QUESTION_DEFS.filter(function (def) { return isQuestionAnswered(p, def); }).length;
    return { total: total, answered: answered, percent: total ? Math.round((answered / total) * 100) : 0 };
  }

  function fieldRow(label, value) {
    if (value === undefined || value === null || value === "") return null;
    var row = document.createElement("div");
    row.className = "roster-field";
    var labelEl = document.createElement("span");
    labelEl.className = "roster-field-label";
    labelEl.textContent = label;
    var valueEl = document.createElement("span");
    valueEl.className = "roster-field-value";
    valueEl.textContent = String(value);
    row.appendChild(labelEl);
    row.appendChild(valueEl);
    return row;
  }

  function buildRosterGroup(groupKey, p) {
    var defs = QUESTION_DEFS.filter(function (def) { return def.group === groupKey && isQuestionAnswered(p, def); });
    if (!defs.length) return null;
    var group = document.createElement("div");
    group.className = "roster-group";
    var heading = document.createElement("h4");
    heading.textContent = t(GROUP_TITLE_KEYS[groupKey]);
    group.appendChild(heading);
    defs.forEach(function (def) {
      var row = fieldRow(t(def.labelKey), questionDisplayValue(p, def));
      if (row) group.appendChild(row);
    });
    return group;
  }

  function buildProgressBar(progress) {
    var wrap = document.createElement("div");
    wrap.className = "roster-progress";
    var label = document.createElement("span");
    label.className = "small muted roster-progress-label";
    label.textContent = t("progress_questions_label") + progress.answered + "/" + progress.total + " (" + progress.percent + "%)";
    var bar = document.createElement("div");
    bar.className = "roster-progress-bar";
    var fill = document.createElement("div");
    fill.className = "roster-progress-fill";
    fill.style.width = progress.percent + "%";
    bar.appendChild(fill);
    wrap.appendChild(label);
    wrap.appendChild(bar);
    return wrap;
  }

  function buildPendingGroup(p) {
    var pending = QUESTION_DEFS.filter(function (def) { return !isQuestionAnswered(p, def); });
    if (!pending.length) return null;

    var group = document.createElement("div");
    group.className = "roster-group roster-pending-group";
    var heading = document.createElement("h4");
    heading.textContent = t("pending_questions_label") + " (" + pending.length + ")";
    group.appendChild(heading);

    var entries = pending.map(function (def) {
      var row = document.createElement("div");
      row.className = "roster-pending-row";
      var label = document.createElement("span");
      label.className = "small muted roster-pending-label";
      label.textContent = t(def.labelKey);
      var input;
      if (def.choices) {
        input = document.createElement("select");
        input.className = "roster-pending-input";
        var opt = document.createElement("option");
        opt.value = "";
        opt.textContent = t("opt_select_ellipsis");
        input.appendChild(opt);
        def.choices.forEach(function (choice) {
          var o = document.createElement("option");
          o.value = choice.value;
          o.textContent = choiceLabel(choice);
          input.appendChild(o);
        });
      } else {
        input = document.createElement("input");
        input.type = "text";
        input.className = "roster-pending-input";
        input.placeholder = def.isList ? t("placeholder_comma_separated") : t("placeholder_write_answer");
      }
      row.appendChild(label);
      row.appendChild(input);
      group.appendChild(row);
      return { def: def, input: input };
    });

    var statusEl = document.createElement("span");
    statusEl.className = "small muted roster-pending-status";

    var saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "primary";
    saveBtn.textContent = t("btn_save_answers");
    saveBtn.addEventListener("click", function () {
      if (!p._docId) {
        statusEl.textContent = t("status_profile_not_found");
        return;
      }
      var updates = {};
      var any = false;
      entries.forEach(function (entry) {
        var raw = entry.input.value.trim();
        if (!raw) return;
        any = true;
        var value = entry.def.isList
          ? raw.split(",").map(function (s) { return s.trim(); }).filter(Boolean)
          : raw;
        entry.def.keys.forEach(function (key) { updates[key] = value; });
      });
      if (!any) {
        statusEl.textContent = t("status_write_one_answer");
        return;
      }
      updates.updatedAt = new Date().toISOString();
      saveBtn.disabled = true;
      statusEl.textContent = t("status_saving");
      expandedRosterDocId = p._docId;
      db.collection(USERS_COLLECTION).doc(p._docId).update(updates)
        .then(function () {
          toast(t("toast_answers_saved_for") + (p.name || p.email || t("text_the_athlete")), "ok");
          loadRoster();
        })
        .catch(function (err) {
          saveBtn.disabled = false;
          statusEl.textContent = "";
          toast(t("toast_save_failed") + (err.message || err.code), "error");
        });
    });

    var actionsRow = document.createElement("div");
    actionsRow.className = "row";
    actionsRow.appendChild(saveBtn);
    actionsRow.appendChild(statusEl);
    group.appendChild(actionsRow);

    return group;
  }

  function buildRosterItem(p) {
    var item = document.createElement("div");
    item.className = "roster-item";

    var header = document.createElement("div");
    header.className = "roster-item-header";

    if (p.photo) {
      var img = document.createElement("img");
      img.className = "avatar";
      img.src = p.photo;
      img.alt = p.name || p.email || t("alt_athlete");
      header.appendChild(img);
    } else {
      var fallback = document.createElement("div");
      fallback.className = "avatar";
      var initials = String(p.name || p.email || "AT").trim().slice(0, 2).toUpperCase();
      fallback.textContent = initials;
      header.appendChild(fallback);
    }

    var info = document.createElement("div");
    info.className = "roster-item-info";
    var nameEl = document.createElement("strong");
    nameEl.textContent = p.name || p.email || t("text_no_name");
    var summaryEl = document.createElement("span");
    summaryEl.className = "small muted";
    var summaryParts = [];
    if (p.age) summaryParts.push(p.age + " " + t("unit_years_old"));
    if (p.weightClass || p.weight_class) summaryParts.push((p.weightClass || p.weight_class) + " kg/lb");
    if (p.clubName) summaryParts.push(p.clubName);
    summaryEl.textContent = summaryParts.join(" - ") || (p.email || "");
    info.appendChild(nameEl);
    info.appendChild(summaryEl);
    header.appendChild(info);

    var toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "ghost";

    var progress = computeProgress(p);
    item.appendChild(header);
    item.appendChild(buildProgressBar(progress));

    var detail = document.createElement("div");
    detail.className = "roster-detail";
    var startExpanded = expandedRosterDocId && p._docId === expandedRosterDocId;
    detail.classList.toggle("hidden", !startExpanded);
    toggleBtn.textContent = startExpanded ? t("btn_view_less") : t("btn_view_more");
    header.appendChild(toggleBtn);

    ["training", "competition", "coaching", "camp"].forEach(function (groupKey) {
      var group = buildRosterGroup(groupKey, p);
      if (group) detail.appendChild(group);
    });

    var pendingGroup = buildPendingGroup(p);
    if (pendingGroup) detail.appendChild(pendingGroup);

    item.appendChild(detail);

    toggleBtn.addEventListener("click", function () {
      var nowHidden = detail.classList.toggle("hidden");
      expandedRosterDocId = nowHidden ? null : p._docId;
      toggleBtn.textContent = nowHidden ? t("btn_view_more") : t("btn_view_less");
    });

    return item;
  }

  function renderRoster(filterText) {
    var query = String(filterText || "").trim().toLowerCase();
    var filtered = rosterAthletes.filter(function (p) {
      if (!query) return true;
      var haystack = ((p.name || "") + " " + (p.email || "")).toLowerCase();
      return haystack.indexOf(query) !== -1;
    });
    filtered.sort(function (a, b) {
      return String(a.name || a.email || "").localeCompare(String(b.name || b.email || ""));
    });
    rosterList.textContent = "";
    filtered.forEach(function (p) {
      rosterList.appendChild(buildRosterItem(p));
    });
    rosterCount.textContent = String(filtered.length);
  }

  function loadRoster() {
    db.collection(USERS_COLLECTION).where("role", "==", "athlete").get()
      .then(function (snapshot) {
        rosterAthletes = snapshot.docs.map(function (doc) {
          return Object.assign({ _docId: doc.id }, doc.data());
        });
        renderRoster(val("rosterSearch"));
      })
      .catch(function (err) {
        toast(t("toast_roster_load_failed") + (err.message || err.code), "error");
      });
  }

  if (rosterSearchInput) {
    rosterSearchInput.addEventListener("input", function () {
      renderRoster(rosterSearchInput.value);
    });
  }

  // ---------- SESSION ----------

  function defaultProfileFor(user) {
    return {
      user_id: user.uid,
      email: user.email || "",
      name: user.displayName || "",
      role: "athlete",
      view: "athlete"
    };
  }

  function applyLoadedProfile(profile, docId) {
    currentProfile = profile;
    currentProfileDocId = docId;
    populateAthleteProfileForm(currentProfile);
    var rawRole = String(currentProfile.role || "").trim().toLowerCase();
    if (rawRole === "coach" || rawRole === "admin") {
      rosterCard.classList.remove("hidden");
      loadRoster();
    } else {
      rosterCard.classList.add("hidden");
    }
  }

  auth.onAuthStateChanged(function (user) {
    if (!user) {
      currentUid = null;
      currentProfileDocId = null;
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
        if (doc.exists) {
          applyLoadedProfile(doc.data(), user.uid);
          return;
        }
        if (!user.email) {
          applyLoadedProfile(defaultProfileFor(user), user.uid);
          return null;
        }
        // Some legacy accounts (e.g. created directly in Firestore before
        // this app's signup flow existed) have a doc ID that doesn't match
        // the Firebase Auth UID. Fall back to an email lookup so those
        // profiles (notably coach accounts) still resolve correctly.
        return db.collection(USERS_COLLECTION).where("email", "==", user.email).limit(1).get()
          .then(function (snapshot) {
            if (!snapshot.empty) {
              applyLoadedProfile(snapshot.docs[0].data(), snapshot.docs[0].id);
            } else {
              applyLoadedProfile(defaultProfileFor(user), user.uid);
            }
          });
      })
      .catch(function (err) {
        toast(t("toast_profile_load_failed") + (err.message || err.code), "error");
      });
  });

  window.WPL_onLanguageChange = function () {
    if (rosterCard && !rosterCard.classList.contains("hidden")) {
      renderRoster(val("rosterSearch"));
    }
  };
}());
