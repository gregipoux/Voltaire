// Hark! L'instrument de notre vigilance est chargé et prêt!
console.log("Content script loaded and running.");

// Cache pour éviter de ré-analyser les mêmes phrases
const analyzedPhrases = new WeakSet();

// Par cette sorcellerie, j'ordonne un temps de latence avant de relancer nos sorts, pour ne pas surcharger nos énergies magiques.
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

// Trouve tous les divs avec la classe css-146c3p1 dans un conteneur
function findTextDivs(container) {
  // Sélecteur pour les divs avec la classe css-146c3p1 (qui commence par css-)
  // On cherche les divs qui ont dir="auto" et contiennent du texte
  const allDivs = container.querySelectorAll('div[dir="auto"]');
  const textDivs = Array.from(allDivs).filter(div => {
    const text = div.textContent.trim();
    // Ignorer les divs vides ou qui ne contiennent que des espaces
    return text.length > 0;
  });
  return textDivs;
}

// Identifie les conteneurs de phrases dans #root
// Un conteneur de phrase est un div parent qui contient plusieurs mots (divs avec texte)
function findSentenceContainers(rootElement) {
  const containers = [];
  
  // Parcourir tous les divs dans #root
  const allDivs = rootElement.querySelectorAll('div');
  
  allDivs.forEach(div => {
    // Ignorer les divs déjà analysés ou modifiés par notre extension
    if (div.hasAttribute('data-voltaire-analyzed') || div.hasAttribute('data-voltaire')) {
      return;
    }
    
    // Chercher les divs enfants avec du texte
    const textDivs = findTextDivs(div);
    
    // Si le conteneur a au moins 2 mots, c'est probablement une phrase
    if (textDivs.length >= 2) {
      // Vérifier que ce n'est pas un conteneur déjà inclus dans un autre
      let isSubContainer = false;
      containers.forEach(existingContainer => {
        if (existingContainer.contains(div)) {
          isSubContainer = true;
        }
      });
      
      if (!isSubContainer) {
        containers.push(div);
      }
    }
  });
  
  return containers;
}

// Reconstruit le texte complet depuis les divs individuels
function reconstructText(container) {
  const textDivs = findTextDivs(container);
  
  // Obtenir le texte complet directement du conteneur pour garantir l'exactitude
  // innerText préserve mieux les espaces que textContent
  const fullText = container.innerText || container.textContent || '';
  
  // Créer un Range pour parcourir le texte et mapper chaque caractère à son div
  const range = document.createRange();
  const divMapping = new Array(fullText.length);
  const wordDivs = [];
  
  let currentTextOffset = 0;
  let currentWordStart = 0;
  let currentWordDiv = null;
  
  // Parcourir chaque div dans l'ordre
  textDivs.forEach((div, index) => {
    const divText = div.textContent || '';
    const trimmedText = divText.trim();
    
    if (trimmedText.length === 0) return;
    
    // Trouver où commence ce mot dans le texte complet
    // On cherche à partir de currentTextOffset pour éviter les doublons
    let wordStartInText = fullText.indexOf(trimmedText, currentTextOffset);
    
    // Si on ne trouve pas, essayer sans l'offset
    if (wordStartInText === -1) {
      wordStartInText = fullText.indexOf(trimmedText);
    }
    
    if (wordStartInText !== -1 && wordStartInText < fullText.length) {
      // Mapper chaque caractère de ce mot
      for (let i = 0; i < trimmedText.length && (wordStartInText + i) < fullText.length; i++) {
        divMapping[wordStartInText + i] = {
          div: div,
          charIndex: i,
          wordIndex: index
        };
      }
      
      wordDivs.push({ 
        div: div, 
        startOffset: wordStartInText, 
        endOffset: wordStartInText + trimmedText.length,
        text: trimmedText
      });
      
      currentTextOffset = wordStartInText + trimmedText.length;
    } else {
      // Fallback: méthode simple si la recherche échoue
      const fallbackStart = currentTextOffset;
      for (let i = 0; i < trimmedText.length; i++) {
        if (fallbackStart + i < fullText.length) {
          divMapping[fallbackStart + i] = {
            div: div,
            charIndex: i,
            wordIndex: index
          };
        }
      }
      
      wordDivs.push({ 
        div: div, 
        startOffset: fallbackStart, 
        endOffset: fallbackStart + trimmedText.length,
        text: trimmedText
      });
      
      currentTextOffset = fallbackStart + trimmedText.length;
    }
  });
  
  return {
    text: fullText,
    mapping: divMapping,
    textDivs: textDivs,
    wordDivs: wordDivs
  };
}

// Trouve le div correspondant à un offset dans le texte
function findDivForOffset(container, offset, textData, length = 1) {
  if (offset < 0) {
    console.warn('Invalid offset:', offset);
    return null;
  }
  
  // Méthode 1: Chercher directement dans le mapping
  if (offset < textData.mapping.length) {
    const mapped = textData.mapping[offset];
    if (mapped && mapped.div) {
      return mapped.div;
    }
  }
  
  // Méthode 2: Utiliser wordDivs pour trouver le mot qui contient cet offset
  for (let i = 0; i < textData.wordDivs.length; i++) {
    const wordInfo = textData.wordDivs[i];
    // Vérifier si l'offset est dans ce mot (inclusif)
    if (offset >= wordInfo.startOffset && offset < wordInfo.endOffset) {
      return wordInfo.div;
    }
    // Aussi vérifier si l'offset + length chevauche ce mot
    if (offset < wordInfo.endOffset && (offset + length) > wordInfo.startOffset) {
      return wordInfo.div;
    }
  }
  
  // Méthode 3: Si l'offset pointe vers un espace, chercher le div suivant
  for (let i = offset; i < textData.mapping.length && i < offset + 10; i++) {
    if (textData.mapping[i] && textData.mapping[i].div) {
      return textData.mapping[i].div;
    }
  }
  
  // Méthode 4: Chercher le div précédent
  for (let i = offset; i >= 0 && i > offset - 10; i--) {
    if (textData.mapping[i] && textData.mapping[i].div) {
      return textData.mapping[i].div;
    }
  }
  
  console.warn('Could not find div for offset:', offset, 'length:', length, 'text length:', textData.mapping.length);
  return null;
}

// Trouve le div correspondant au texte de l'erreur (plus fiable que l'offset)
function findDivByErrorText(errorText, textData) {
  // Nettoyer le texte de l'erreur (enlever les espaces, ponctuation)
  const cleanedErrorText = errorText.trim().toLowerCase();
  
  if (cleanedErrorText.length === 0) {
    return null;
  }
  
  // Parcourir tous les divs de mots pour trouver celui qui correspond
  for (let i = 0; i < textData.wordDivs.length; i++) {
    const wordInfo = textData.wordDivs[i];
    const wordText = wordInfo.text.trim().toLowerCase();
    
    // Vérifier si le texte de l'erreur correspond exactement au mot
    if (wordText === cleanedErrorText) {
      return wordInfo.div;
    }
    
    // Vérifier si le mot contient le texte de l'erreur (pour les cas où l'erreur est une partie du mot)
    if (wordText.includes(cleanedErrorText) || cleanedErrorText.includes(wordText)) {
      return wordInfo.div;
    }
  }
  
  // Si on ne trouve pas par correspondance exacte, chercher par similarité
  // (pour gérer les cas où le texte peut avoir des variations)
  for (let i = 0; i < textData.wordDivs.length; i++) {
    const wordInfo = textData.wordDivs[i];
    const wordText = wordInfo.text.trim().toLowerCase();
    
    // Vérifier si les premiers caractères correspondent
    const minLength = Math.min(wordText.length, cleanedErrorText.length);
    if (minLength > 0 && wordText.substring(0, minLength) === cleanedErrorText.substring(0, minLength)) {
      return wordInfo.div;
    }
  }
  
  return null;
}

// Insère un point "." devant le div du mot fautif
function insertDotBeforeDiv(targetDiv) {
  if (!targetDiv || targetDiv.hasAttribute('data-voltaire-dot')) {
    return; // Déjà modifié
  }
  
  // Créer le span avec le point
  const dotSpan = document.createElement('span');
  dotSpan.textContent = '.';
  dotSpan.style.color = 'black';
  dotSpan.style.fontSize = 'inherit'; // Hériter de la taille du parent
  dotSpan.style.display = 'inline'; // S'assurer qu'il est inline
  dotSpan.style.verticalAlign = 'baseline'; // Aligner avec le texte
  dotSpan.style.marginRight = '0'; // Pas de marge
  dotSpan.style.paddingRight = '0'; // Pas de padding
  dotSpan.setAttribute('data-voltaire', '1');
  dotSpan.setAttribute('data-voltaire-dot', '1');
  

  let insertPosition = null;
  
  // Parcourir les enfants pour trouver où insérer
  for (let i = 0; i < targetDiv.childNodes.length; i++) {
    const child = targetDiv.childNodes[i];
    // Si c'est un nœud de texte, insérer avant
    if (child.nodeType === Node.TEXT_NODE && child.textContent.trim().length > 0) {
      insertPosition = child;
      break;
    }
    // Si c'est un élément, insérer avant
    if (child.nodeType === Node.ELEMENT_NODE) {
      insertPosition = child;
      break;
    }
  }
  
  if (insertPosition) {
    targetDiv.insertBefore(dotSpan, insertPosition);
  } else if (targetDiv.firstChild) {
    // Fallback: insérer avant le premier enfant
    targetDiv.insertBefore(dotSpan, targetDiv.firstChild);
  } else {
    // Si le div est vide, ajouter directement
    targetDiv.appendChild(dotSpan);
  }
  
  targetDiv.setAttribute('data-voltaire-dot', '1'); // Marquer le div aussi
}

// Affiche les corrections en insérant des points devant les mots fautifs
function displayCorrection(container, textData, corrections) {
  if (!Array.isArray(corrections)) {
    console.error('Expected corrections to be an array, received:', corrections);
    return;
  }

  console.log('Corrections:', corrections);
  console.log('Text data:', {
    text: textData.text,
    textLength: textData.text.length,
    mappingLength: textData.mapping.length,
    wordCount: textData.wordDivs.length
  });
  
  // Trier par offset décroissant pour traiter de droite à gauche
  corrections.sort((a, b) => b.offset - a.offset);

  corrections.forEach(correction => {
    const { offset, length } = correction;
    const errorText = textData.text.substring(offset, offset + length).trim();
    console.log('Processing error at offset:', offset, 'with length:', length, 'error text:', errorText);

    // Méthode 1: Essayer de trouver le div par le texte de l'erreur (plus fiable)
    let targetDiv = findDivByErrorText(errorText, textData);
    
    // Méthode 2: Si on ne trouve pas par le texte, utiliser l'offset
    if (!targetDiv) {
      targetDiv = findDivForOffset(container, offset, textData, length);
    }
    
    if (targetDiv) {
      const wordText = targetDiv.textContent.trim();
      console.log('Found div for error, word:', wordText, 'error text was:', errorText);
      
      // Vérifier que le div trouvé correspond bien à l'erreur
      // (pour éviter les faux positifs)
      const wordTextLower = wordText.toLowerCase();
      const errorTextLower = errorText.toLowerCase();
      
      if (wordTextLower === errorTextLower || 
          wordTextLower.includes(errorTextLower) || 
          errorTextLower.includes(wordTextLower)) {
        insertDotBeforeDiv(targetDiv);
      } else {
        console.warn('Div found but text does not match:', wordText, 'vs', errorText);
        // Essayer quand même si c'est le seul div proche de l'offset
        insertDotBeforeDiv(targetDiv);
      }
    } else {
      console.error('Error: Could not find div for offset:', offset, 'length:', length, 'error text:', errorText);
      console.log('Available word divs:', textData.wordDivs.map(w => ({
        start: w.startOffset,
        end: w.endOffset,
        text: w.div.textContent.trim()
      })));
    }
  });
}

// Vérifie et affiche les corrections pour un conteneur de phrase
function checkAndDisplayCorrections(container) {
  // Éviter de ré-analyser
  if (analyzedPhrases.has(container) || container.hasAttribute('data-voltaire-analyzed')) {
    return;
  }
  
  // Reconstruire le texte
  const textData = reconstructText(container);
  const originalText = textData.text;
  const trimmedText = originalText.trim();
  
  if (trimmedText.length === 0) {
    return;
  }
  
  // Calculer le décalage (nombre d'espaces au début)
  const leadingSpaces = originalText.length - originalText.trimStart().length;
  
  console.log('Analyzing text:', trimmedText);
  console.log('Original text length:', originalText.length);
  console.log('Trimmed text length:', trimmedText.length);
  console.log('Leading spaces:', leadingSpaces);
  console.log('Text divs found:', textData.textDivs.length);
  console.log('Words:', textData.wordDivs.map(w => w.div.textContent.trim()));
  
  // Appeler l'API LanguageTool via le service worker pour éviter les problèmes CORS
  chrome.runtime.sendMessage({
    action: 'checkText',
    text: trimmedText,
    language: 'fr'
  }, (response) => {
    // Gérer les erreurs silencieusement
    if (chrome.runtime.lastError) {
      // Ne logger que si ce n'est pas une erreur de port fermé (normale)
      if (!chrome.runtime.lastError.message.includes('port') && 
          !chrome.runtime.lastError.message.includes('closed')) {
        console.debug('Service worker error:', chrome.runtime.lastError.message);
      }
      // Marquer comme analysé même en cas d'erreur pour éviter les boucles
      analyzedPhrases.add(container);
      container.setAttribute('data-voltaire-analyzed', '1');
      return;
    }
    
    // Vérifier si la réponse contient une erreur
    if (response && response.error) {
      console.debug('LanguageTool API error:', response.error);
      // Marquer comme analysé même en cas d'erreur
      analyzedPhrases.add(container);
      container.setAttribute('data-voltaire-analyzed', '1');
      return;
    }
    
    if (response && response.matches && Array.isArray(response.matches) && response.matches.length > 0) {
      console.log('API Response:', response);
      // Ajuster les offsets pour tenir compte du trim
      const adjustedMatches = response.matches.map(match => ({
        ...match,
        offset: match.offset + leadingSpaces
      }));
      displayCorrection(container, textData, adjustedMatches);
    } else {
      console.log('No errors found');
    }
    
    // Marquer comme analysé
    analyzedPhrases.add(container);
    container.setAttribute('data-voltaire-analyzed', '1');
  });
}

// Débouncer pour éviter trop d'appels API
const debouncedCheckAndDisplayCorrections = debounce(checkAndDisplayCorrections, 500);

// Analyse tous les conteneurs de phrases dans #root
function analyzeAllSentences() {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.log('Root element not found, waiting...');
    return;
  }
  
  const containers = findSentenceContainers(rootElement);
  console.log('Found', containers.length, 'sentence containers');
  
  containers.forEach(container => {
    debouncedCheckAndDisplayCorrections(container);
  });
}

// Initialise le MutationObserver pour surveiller #root
function initMutationObserver() {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    // Attendre que #root soit disponible
    setTimeout(initMutationObserver, 100);
    return;
  }
  
  const observer = new MutationObserver(mutations => {
    let shouldAnalyze = false;
    
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        // Ignorer nos propres modifications
        if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute && node.hasAttribute('data-voltaire')) {
          return;
        }
        
        // Si un nouveau nœud est ajouté dans #root, analyser
        if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
          // Vérifier si c'est dans #root ou un descendant
          let parent = node.parentNode;
          while (parent) {
            if (parent.id === 'root') {
              shouldAnalyze = true;
              break;
            }
            parent = parent.parentNode;
          }
        }
      });
    });
    
    if (shouldAnalyze) {
      // Attendre un peu pour que le DOM soit stable
      setTimeout(() => {
        analyzeAllSentences();
      }, 300);
    }
  });

  // Observer #root et tous ses descendants
  observer.observe(rootElement, { 
    childList: true, 
    subtree: true,
    characterData: true
  });
  
  console.log('MutationObserver initialized for #root');
  
  // Analyser les phrases existantes
  setTimeout(() => {
    analyzeAllSentences();
  }, 1000);
}

// Démarrer l'observation
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMutationObserver);
} else {
  initMutationObserver();
}
