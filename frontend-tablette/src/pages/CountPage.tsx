import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { getCampagneActive, getArticleByCodeBarre, getArticleByCodeArticle, saveComptage, getPendingComptages } from "@/db/schema";
import { useSyncStore } from "@/store/sync";
import type { ArticleLocal, CampagneLocal } from "@/types";

type CountState = "scan" | "confirm" | "saved";

export default function CountPage() {
  const navigate = useNavigate();
  const { setPendingCount } = useSyncStore();

  const [campagne, setCampagne] = useState<CampagneLocal | null>(null);
  const [state, setState] = useState<CountState>("scan");
  const [codeBarre, setCodeBarre] = useState("");
  const [codeArticle, setCodeArticle] = useState("");
  const [article, setArticle] = useState<ArticleLocal | null>(null);
  const [articleHorsCampagne, setArticleHorsCampagne] = useState(false);
  const [quantite, setQuantite] = useState("");
  const [error, setError] = useState("");
  const [lastSaved, setLastSaved] = useState<{ libelle: string; quantite: number } | null>(null);

  const barcodeRef = useRef<HTMLInputElement>(null);
  const codeArticleRef = useRef<HTMLInputElement>(null);
  const quantiteRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getCampagneActive().then((c) => setCampagne(c ?? null));
    barcodeRef.current?.focus();
  }, []);

  useEffect(() => {
    if (state === "confirm") quantiteRef.current?.focus();
  }, [state]);

  const findAndConfirm = (found: ArticleLocal | undefined, currentCampagne: CampagneLocal | null) => {
    if (!found) return false;
    setArticle(found);
    setState("confirm");
    setError("");
    const dansLaCampagne = currentCampagne?.lignes.some((l) => l.article_id === found.id) ?? false;
    setArticleHorsCampagne(!dansLaCampagne);
    return true;
  };

  const handleBarcodeSubmit = async () => {
    setError("");
    const code = codeBarre.trim();
    if (!code) return;

    const found = await getArticleByCodeBarre(code);
    if (!findAndConfirm(found, campagne)) {
      setError(`Code barre "${code}" introuvable`);
      setCodeBarre("");
      barcodeRef.current?.focus();
    }
  };

  const handleCodeArticleSubmit = async () => {
    setError("");
    const code = codeArticle.trim();
    if (!code) return;

    const found = await getArticleByCodeArticle(code);
    if (!findAndConfirm(found, campagne)) {
      setError(`Code article "${code}" introuvable`);
      setCodeArticle("");
      codeArticleRef.current?.focus();
    }
  };

  const handleQuantiteSubmit = async () => {
    if (!article || !campagne || !quantite) return;
    const q = parseFloat(quantite);
    if (isNaN(q) || q < 0) {
      setError("Quantité invalide");
      return;
    }

    const comptage = {
      client_uuid: uuidv4(),
      campagne_id: campagne.id,
      article_id: article.id,
      quantite: q,
      counted_at: new Date().toISOString(),
      synced: false,
    };
    await saveComptage(comptage);

    const pending = await getPendingComptages();
    setPendingCount(pending.length);

    setLastSaved({ libelle: article.libelle, quantite: q });
    setState("saved");

    setTimeout(() => {
      setCodeBarre("");
      setCodeArticle("");
      setQuantite("");
      setArticle(null);
      setArticleHorsCampagne(false);
      setState("scan");
      barcodeRef.current?.focus();
    }, 1500);
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === "Enter") action();
  };

  if (!campagne) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-6">
        <div className="text-4xl mb-3">📋</div>
        <p className="text-gray-600 text-lg font-medium">Aucune campagne active</p>
        <button
          onClick={() => navigate("/")}
          className="mt-6 px-6 py-3 bg-blue-700 text-white rounded-xl font-semibold"
        >
          Retour
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col text-white">
      {/* Header */}
      <header className="bg-gray-800 px-5 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate("/")}
          className="text-gray-400 hover:text-white text-2xl"
          aria-label="Retour"
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold truncate">{campagne.nom}</h1>
          <p className="text-xs text-gray-400">Mode comptage</p>
        </div>
      </header>

      <main className="flex-1 flex flex-col p-5 gap-4">
        {/* Zone scan code barre */}
        <div className="bg-gray-800 rounded-2xl p-5">
          <label className="block text-xs text-gray-400 uppercase font-semibold mb-3 tracking-wide">
            Code barre
          </label>
          <input
            ref={barcodeRef}
            type="text"
            value={codeBarre}
            onChange={(e) => setCodeBarre(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, handleBarcodeSubmit)}
            placeholder="Scanner ou saisir le code barre…"
            className="w-full bg-gray-700 text-white text-xl font-mono px-4 py-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
            autoComplete="off"
            inputMode="none"
            disabled={state !== "scan"}
          />
          {state === "scan" && (
            <button
              onClick={handleBarcodeSubmit}
              disabled={!codeBarre.trim()}
              className="mt-3 w-full bg-blue-600 text-white font-bold py-4 rounded-xl text-lg disabled:opacity-40"
            >
              Rechercher →
            </button>
          )}
        </div>

        {/* Zone saisie code article */}
        <div className="bg-gray-800 rounded-2xl p-5">
          <label className="block text-xs text-gray-400 uppercase font-semibold mb-3 tracking-wide">
            Code article
          </label>
          <input
            ref={codeArticleRef}
            type="text"
            value={codeArticle}
            onChange={(e) => setCodeArticle(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, handleCodeArticleSubmit)}
            placeholder="Saisir le code article…"
            className="w-full bg-gray-700 text-white text-xl font-mono px-4 py-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder-gray-500"
            autoComplete="off"
            inputMode="text"
            disabled={state !== "scan"}
          />
          {state === "scan" && (
            <button
              onClick={handleCodeArticleSubmit}
              disabled={!codeArticle.trim()}
              className="mt-3 w-full bg-purple-700 text-white font-bold py-4 rounded-xl text-lg disabled:opacity-40"
            >
              Rechercher →
            </button>
          )}
        </div>

        {/* Erreur */}
        {error && (
          <div className="bg-red-900/50 border border-red-500 rounded-xl px-4 py-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Article trouvé + saisie quantité */}
        {(state === "confirm" || state === "saved") && article && (
          <div className={`rounded-2xl p-5 border ${articleHorsCampagne ? "bg-orange-900/50 border-orange-500" : "bg-blue-900/50 border-blue-500"}`}>
            {articleHorsCampagne && (
              <p className="text-xs text-orange-300 font-bold mb-2">
                ⚠ Article hors campagne — sera compté mais n'apparaîtra pas dans le rapport
              </p>
            )}
            <p className={`text-xs uppercase font-semibold mb-1 ${articleHorsCampagne ? "text-orange-300" : "text-blue-300"}`}>Article trouvé</p>
            <p className="text-xl font-bold">{article.libelle}</p>
            <p className="text-sm text-gray-400 font-mono mt-1">
              {article.code_article}{article.code_barre ? ` · ${article.code_barre}` : ""}
            </p>
            {article.unite && (
              <p className="text-sm text-blue-300 mt-1">Unité : {article.unite}</p>
            )}

            <div className="mt-5">
              <label className="block text-xs text-gray-400 uppercase font-semibold mb-2 tracking-wide">
                Quantité comptée
              </label>
              <input
                ref={quantiteRef}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.001"
                value={quantite}
                onChange={(e) => setQuantite(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, handleQuantiteSubmit)}
                placeholder="0"
                className="w-full bg-gray-700 text-white text-3xl font-bold px-4 py-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 text-center"
                disabled={state === "saved"}
              />
              {state === "confirm" && (
                <button
                  onClick={handleQuantiteSubmit}
                  disabled={!quantite}
                  className="mt-3 w-full bg-green-600 text-white font-bold py-5 rounded-xl text-xl disabled:opacity-40"
                >
                  ✓ VALIDER
                </button>
              )}
            </div>
          </div>
        )}

        {/* Confirmation sauvegarde */}
        {state === "saved" && lastSaved && (
          <div className="bg-green-900/50 border border-green-500 rounded-xl px-4 py-3 text-green-300 text-sm text-center">
            ✓ {lastSaved.libelle} — {lastSaved.quantite} enregistré
          </div>
        )}
      </main>
    </div>
  );
}
