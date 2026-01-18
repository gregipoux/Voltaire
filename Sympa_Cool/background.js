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

// Convertit le format de réponse Grammalecte vers le format LanguageTool
function convertGrammalecteToLanguageTool(grammalecteResponse) {
  const matches = [];
  
  // Vérifier si la réponse contient des données
  if (!grammalecteResponse || !grammalecteResponse.data || !Array.isArray(grammalecteResponse.data)) {
    return { matches: [] };
  }
  
  // Traiter chaque paragraphe dans la réponse
  grammalecteResponse.data.forEach(paragraph => {
    // Traiter les erreurs grammaticales
    if (paragraph.lGrammarErrors && Array.isArray(paragraph.lGrammarErrors)) {
      paragraph.lGrammarErrors.forEach(err => {
        if (err.nStart !== undefined && err.nEnd !== undefined) {
          matches.push({
            offset: err.nStart,
            length: err.nEnd - err.nStart,
            message: err.sMessage || err.sRuleId || 'Erreur grammaticale',
            replacements: err.aSuggestions || [],
            context: { text: err.sValue || '' }
          });
        }
      });
    }
    
    // Traiter les erreurs d'orthographe
    if (paragraph.lSpellingErrors && Array.isArray(paragraph.lSpellingErrors)) {
      paragraph.lSpellingErrors.forEach(err => {
        if (err.nStart !== undefined && err.nEnd !== undefined) {
          matches.push({
            offset: err.nStart,
            length: err.nEnd - err.nStart,
            message: `Faute d'orthographe : ${err.sValue || ''}`,
            replacements: err.aSuggestions || [],
            context: { text: err.sValue || '' }
          });
        }
      });
    }
  });
  
  return { matches };
}

// Écouter les messages du content script pour appeler l'API Grammalecte
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkText') {
    const { text, language } = request;
    
    if (!text || text.trim().length === 0) {
      console.warn('[Voltaire] Empty text received');
      sendResponse({ matches: [] });
      return false;
    }
    
    console.log('[Voltaire] Checking text:', text.substring(0, 50) + '...', 'language:', language);
    
    // Appeler le serveur Grammalecte local
    const url = 'http://localhost:8080/gc_text/fr';
    
    // Préparer les données pour le POST (format application/x-www-form-urlencoded)
    const formData = new URLSearchParams();
    formData.append('text', text);
    
    fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('[Voltaire] Grammalecte API response received');
      
      // Convertir le format Grammalecte vers le format LanguageTool
      const convertedData = convertGrammalecteToLanguageTool(data);
      
      console.log('[Voltaire] Converted response:', {
        matches: convertedData.matches?.length || 0
      });
      
      // S'assurer que sendResponse est toujours appelé avec succès
      try {
        sendResponse(convertedData);
      } catch (e) {
        // Ignorer les erreurs si le port est fermé
        console.debug('[Voltaire] Response already sent or port closed');
      }
    })
    .catch(error => {
      // Logger l'erreur avec un message clair
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        console.error('[Voltaire] Grammalecte server not available. Please start the server with: python grammalecte-server.py');
      } else {
        console.error('[Voltaire] Grammalecte API error:', error.message);
      }
      
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
