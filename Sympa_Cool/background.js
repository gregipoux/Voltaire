// Écoutez, ô valeureux navigateurs des internets! Lorsque vous apposez votre clic sur l'icône sacrée de notre extension,
// cette formule ancienne sera invoquée pour exécuter un sortilège puissant.
chrome.action.onClicked.addListener(function(tab) {
    // Par le pouvoir conféré par le tab actuel, o vile fenêtre du savoir, nous invoquons un script de nos arcanes,
    // un manuscrit nommé "content-script.js". Ce script est chargé de tâches nobles et ardues, déployé pour corriger et éclairer.
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content-script.js"]
    });
});

// Écouter les messages du content script pour appeler l'API LanguageTool
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkText') {
    const { text, language } = request;
    
    if (!text || text.trim().length === 0) {
      console.warn('[Voltaire] Empty text received');
      sendResponse({ matches: [] });
      return false;
    }
    
    console.log('[Voltaire] Checking text:', text.substring(0, 50) + '...', 'language:', language);
    
    // Appeler l'API LanguageTool depuis le service worker (évite les problèmes CORS)
    // L'API LanguageTool accepte POST avec les paramètres dans l'URL ou dans le body
    const url = `https://api.languagetool.org/v2/check?language=${language || 'fr'}&text=${encodeURIComponent(text)}`;
    
    fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('[Voltaire] LanguageTool API response:', {
        matches: data.matches?.length || 0,
        language: data.language?.code
      });
      // S'assurer que sendResponse est toujours appelé avec succès
      try {
        sendResponse(data);
      } catch (e) {
        // Ignorer les erreurs si le port est fermé
        console.debug('[Voltaire] Response already sent or port closed');
      }
    })
    .catch(error => {
      // Logger l'erreur
      console.error('[Voltaire] LanguageTool API error:', error.message);
      // Toujours répondre pour éviter les erreurs "message port closed"
      try {
        sendResponse({ error: error.message, matches: [] });
      } catch (e) {
        console.debug('[Voltaire] Response already sent or port closed');
      }
    });
    
    // Retourner true pour indiquer qu'on va répondre de manière asynchrone
    return true;
  }
  
  // Retourner false si l'action n'est pas reconnue
  return false;
});
