// Hark! L'instrument de notre vigilance est chargé et prêt!
console.log("[Voltaire] Content script loaded and running.");

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

// Trouve tous les divs avec du texte dans un conteneur
function findTextDivs(container) {
  // Méthode 1: Chercher les divs avec dir="auto" (structure spécifique)
  const divsWithDir = container.querySelectorAll('div[dir="auto"]');
  const textDivs1 = Array.from(divsWithDir).filter(div => {
    const text = div.textContent.trim();
    return text.length > 0;
  });
  
  // Méthode 2: Si pas de résultats, chercher tous les divs avec du texte direct
  if (textDivs1.length === 0) {
    const allDivs = container.querySelectorAll('div');
    const textDivs2 = Array.from(allDivs).filter(div => {
      // Ignorer les divs qui contiennent d'autres divs (conteneurs)
      if (div.querySelector('div')) {
        return false;
      }
      const text = div.textContent.trim();
      // Ignorer les divs vides ou qui ne contiennent que des espaces
      return text.length > 0 && text.length < 100; // Limiter la longueur pour éviter les gros blocs
    });
    return textDivs2;
  }
  
  return textDivs1;
}

// Vérifie si un texte ressemble à une consigne/instruction plutôt qu'à une phrase à analyser
function isInstructionText(text) {
  const trimmed = text.trim().toLowerCase();
  
  // Mots-clés typiques des consignes
  const instructionKeywords = [
    'cliquez', 'cliquer', 'clique', 'cliquons',
    'si vous', 'si tu', 'si on',
    'veuillez', 'merci de', 'n\'oubliez pas',
    'consigne', 'instruction', 'indication',
    'appuyez', 'appuyer', 'appuie',
    'sélectionnez', 'sélectionner', 'sélectionne',
    'choisissez', 'choisir', 'choisis',
    'il n\'y a pas', 'pas de faute', 'aucune faute'
  ];
  
  // Mots-clés typiques de navigation/menus
  const navigationKeywords = [
    'orthographe', 'orthotypographie', 'expression', 'courriel',
    'niveau', 'niveaux', 'continuer', 'commencer', 'commencer',
    'supérieur', 'validation', 'test blanc', 'règles maîtrisées',
    'temps d\'entraînement', 'voir toutes les règles',
    'pour accéder', 'effectuez l\'évaluation', 'ce parcours n\'est pas'
  ];
  
  // Vérifier si le texte commence par un mot-clé d'instruction
  for (const keyword of instructionKeywords) {
    if (trimmed.startsWith(keyword)) {
      return true;
    }
  }
  
  // Vérifier si le texte contient des mots-clés de navigation
  for (const keyword of navigationKeywords) {
    if (trimmed.includes(keyword)) {
      // Si c'est juste le mot seul ou un titre, ignorer
      const words = trimmed.split(/\s+/);
      if (words.length <= 5 || !/[.!?]$/.test(trimmed)) {
        return true;
      }
    }
  }
  
  // Ignorer les textes très courts (moins de 15 caractères) qui sont souvent des consignes
  if (trimmed.length < 15) {
    return true;
  }
  
  // Ignorer les textes qui sont juste des mots isolés ou des phrases très courtes sans ponctuation
  const words = trimmed.split(/\s+/);
  if (words.length <= 3 && !/[.!?]$/.test(trimmed)) {
    return true;
  }
  
  // Ignorer les textes qui contiennent beaucoup de mots en majuscules (menus/boutons)
  const upperCaseWords = words.filter(w => w.length > 2 && w === w.toUpperCase());
  if (upperCaseWords.length > 2) {
    return true;
  }
  
  return false;
}

// Identifie les conteneurs de phrases dans un élément
// Un conteneur de phrase est un div parent qui contient plusieurs mots (divs avec texte)
function findSentenceContainers(rootElement) {
  const containers = [];
  
  // Parcourir tous les divs dans l'élément
  const allDivs = rootElement.querySelectorAll('div');
  
  allDivs.forEach(div => {
    // Ignorer les divs déjà analysés ou modifiés par notre extension
    if (div.hasAttribute('data-voltaire-analyzed') || div.hasAttribute('data-voltaire')) {
      return;
    }
    
    // Ignorer les divs qui sont trop petits (probablement des mots individuels)
    if (div.children.length === 0 && div.textContent.trim().length < 10) {
      return;
    }
    
    // Chercher les divs enfants avec du texte
    const textDivs = findTextDivs(div);
    
    // Obtenir le texte complet du conteneur
    const containerText = div.textContent.trim();
    
    // Ignorer les consignes/instructions
    if (isInstructionText(containerText)) {
      return;
    }
    
    // Exiger que le texte soit une phrase complète avec ponctuation de fin
    // C'est le critère principal pour identifier une phrase à analyser
    const hasEndPunctuation = /[.!?]$/.test(containerText);
    
    // Si pas de ponctuation de fin, ignorer (sauf si c'est très long et ressemble à une phrase)
    if (!hasEndPunctuation) {
      // Accepter seulement si c'est très long (plus de 100 caractères) et a beaucoup de mots
      const words = containerText.split(/\s+/);
      if (containerText.length < 100 || words.length < 8) {
        return;
      }
    }
    
    // Si le conteneur a au moins 4 mots (au lieu de 3), c'est probablement une phrase
    // Ou si le conteneur lui-même contient du texte significatif (au moins 40 caractères)
    const hasDirectText = containerText.length >= 40;
    const hasMultipleWords = textDivs.length >= 4;
    
    if ((hasMultipleWords || hasDirectText) && !isInstructionText(containerText) && hasEndPunctuation) {
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
  
  // Trier les conteneurs par priorité : ceux avec ponctuation de fin en premier
  containers.sort((a, b) => {
    const aText = a.textContent.trim();
    const bText = b.textContent.trim();
    const aHasPunct = /[.!?]$/.test(aText);
    const bHasPunct = /[.!?]$/.test(bText);
    
    if (aHasPunct && !bHasPunct) return -1;
    if (!aHasPunct && bHasPunct) return 1;
    
    // Sinon, trier par longueur (les plus longues en premier)
    return bText.length - aText.length;
  });
  
  // Si aucun conteneur trouvé avec la méthode normale, essayer de trouver des paragraphes ou spans
  if (containers.length === 0) {
    const paragraphs = rootElement.querySelectorAll('p, span, div');
    Array.from(paragraphs).forEach(elem => {
      const text = elem.textContent.trim();
      // Chercher des éléments avec du texte significatif (au moins 30 caractères)
      // et qui ne sont pas des consignes
      if (text.length >= 30 && !elem.hasAttribute('data-voltaire-analyzed') && !isInstructionText(text)) {
        // Vérifier qu'il n'est pas déjà inclus
        let isSubContainer = false;
        containers.forEach(existingContainer => {
          if (existingContainer.contains(elem)) {
            isSubContainer = true;
          }
        });
        if (!isSubContainer) {
          containers.push(elem);
        }
      }
    });
  }
  
  // Filtrer les conteneurs pour ne garder que les phrases complètes de taille raisonnable
  const filteredContainers = containers.filter(container => {
    const text = container.textContent.trim();
    
    // Ignorer les conteneurs trop grands (probablement des menus/navigation)
    if (text.length > 300) {
      return false;
    }
    
    // Exiger une ponctuation de fin
    if (!/[.!?]$/.test(text)) {
      return false;
    }
    
    // Vérifier que ce n'est pas une consigne
    if (isInstructionText(text)) {
      return false;
    }
    
    // Vérifier qu'il y a assez de mots (au moins 4)
    const words = text.split(/\s+/);
    if (words.length < 4) {
      return false;
    }
    
    return true;
  });
  
  return filteredContainers.length > 0 ? filteredContainers : containers;
}

// Reconstruit le texte complet depuis les divs individuels
function reconstructText(container) {
  const textDivs = findTextDivs(container);
  
  // Obtenir le texte complet directement du conteneur pour garantir l'exactitude
  // innerText préserve mieux les espaces que textContent
  const fullText = container.innerText || container.textContent || '';
  
  // Si aucun div trouvé mais le conteneur a du texte direct, créer un mapping simple
  if (textDivs.length === 0 && fullText.trim().length > 0) {
    // Créer un mapping simple pour le texte direct
    const divMapping = new Array(fullText.length);
    const wordDivs = [];
    
    // Diviser le texte en mots
    const words = fullText.split(/\s+/);
    let currentOffset = 0;
    
    words.forEach((word, index) => {
      if (word.trim().length === 0) return;
      
      const wordStart = fullText.indexOf(word, currentOffset);
      if (wordStart !== -1) {
        for (let i = 0; i < word.length && (wordStart + i) < fullText.length; i++) {
          divMapping[wordStart + i] = {
            div: container,
            charIndex: i,
            wordIndex: index
          };
        }
        
        wordDivs.push({
          div: container,
          startOffset: wordStart,
          endOffset: wordStart + word.length,
          text: word
        });
        
        currentOffset = wordStart + word.length;
      }
    });
    
    return {
      text: fullText,
      mapping: divMapping,
      textDivs: [container],
      wordDivs: wordDivs
    };
  }
  
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

// Crée un mapping entre le texte original et le texte normalisé
// pour convertir les offsets retournés par Grammalecte
function createOffsetMapping(originalText, normalizedText) {
  const mapping = [];
  let originalIndex = 0;
  let normalizedIndex = 0;
  
  // Parcourir le texte original et créer le mapping
  while (originalIndex < originalText.length && normalizedIndex < normalizedText.length) {
    const originalChar = originalText[originalIndex];
    const normalizedChar = normalizedText[normalizedIndex];
    
    // Si les caractères correspondent
    if (originalChar === normalizedChar) {
      mapping[normalizedIndex] = originalIndex;
      originalIndex++;
      normalizedIndex++;
    } else if (/\s/.test(originalChar)) {
      // Si c'est un espace/retour à la ligne dans l'original, avancer seulement dans l'original
      // jusqu'à trouver le prochain caractère non-espace
      while (originalIndex < originalText.length && /\s/.test(originalText[originalIndex])) {
        originalIndex++;
      }
      // Si on arrive à un espace dans le texte normalisé, l'ajouter
      if (normalizedChar === ' ') {
        mapping[normalizedIndex] = originalIndex - 1; // Utiliser la position du dernier espace
        normalizedIndex++;
      }
    } else {
      // Caractères différents (ne devrait pas arriver si la normalisation est correcte)
      mapping[normalizedIndex] = originalIndex;
      originalIndex++;
      normalizedIndex++;
    }
  }
  
  // Remplir les positions manquantes avec la dernière valeur connue
  let lastKnownOffset = 0;
  for (let i = 0; i < mapping.length; i++) {
    if (mapping[i] !== undefined) {
      lastKnownOffset = mapping[i];
    } else {
      mapping[i] = lastKnownOffset;
    }
  }
  
  return {
    normalizedToOriginal: (normalizedOffset) => {
      // Trouver l'offset original correspondant
      if (normalizedOffset >= mapping.length) {
        return originalText.length;
      }
      return mapping[normalizedOffset] || 0;
    }
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
  if (!targetDiv) {
    console.warn('[Voltaire] Cannot insert dot: targetDiv is null');
    return;
  }
  
  // Vérifier si déjà modifié (chercher dans le parent aussi)
  if (targetDiv.hasAttribute('data-voltaire-dot')) {
    return; // Déjà modifié
  }
  
  // Vérifier si un point a déjà été inséré avant ce div
  const previousSibling = targetDiv.previousSibling;
  if (previousSibling && 
      previousSibling.nodeType === Node.ELEMENT_NODE && 
      previousSibling.hasAttribute('data-voltaire-dot')) {
    return; // Déjà un point avant
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
  
  // Essayer d'insérer avant le div (méthode préférée)
  const parent = targetDiv.parentNode;
  if (parent) {
    try {
      parent.insertBefore(dotSpan, targetDiv);
      targetDiv.setAttribute('data-voltaire-dot', '1'); // Marquer le div aussi
      console.log('[Voltaire] Dot inserted before div:', targetDiv.textContent.trim().substring(0, 20));
      return;
    } catch (e) {
      console.warn('[Voltaire] Failed to insert before div, trying inside:', e);
    }
  }
  
  // Fallback: insérer à l'intérieur du div
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
  console.log('[Voltaire] Dot inserted inside div:', targetDiv.textContent.trim().substring(0, 20));
}

// Affiche les corrections en insérant des points devant les mots fautifs
function displayCorrection(container, textData, corrections) {
  if (!Array.isArray(corrections)) {
    console.error('Expected corrections to be an array, received:', corrections);
    return;
  }

  console.log('[Voltaire] Corrections:', corrections);
  console.log('[Voltaire] Text data:', {
    text: textData.text,
    textLength: textData.text.length,
    mappingLength: textData.mapping.length,
    wordCount: textData.wordDivs.length
  });
  
  // Déduplication des erreurs pour éviter les doublons
  const deduplicatedCorrections = [];
  const seenOffsets = new Set();
  const processedDivs = new WeakSet();
  
  // Trier par offset croissant d'abord pour faciliter la déduplication
  corrections.sort((a, b) => a.offset - b.offset);
  
  corrections.forEach(correction => {
    const { offset, length } = correction;
    const errorKey = `${offset}-${length}`;
    const errorEnd = offset + length;
    
    // Ignorer les erreurs exactement identiques (même offset et longueur)
    if (seenOffsets.has(errorKey)) {
      console.log('[Voltaire] Duplicate error ignored:', errorKey);
      return;
    }
    
    // Vérifier les chevauchements avec les erreurs déjà traitées
    let isOverlapping = false;
    for (const existing of deduplicatedCorrections) {
      const existingEnd = existing.offset + existing.length;
      
      // Si les erreurs se chevauchent complètement ou partiellement
      if ((offset >= existing.offset && offset < existingEnd) ||
          (existing.offset >= offset && existing.offset < errorEnd) ||
          (offset === existing.offset && length === existing.length)) {
        // Si une erreur est complètement contenue dans l'autre, garder la plus grande
        if (offset >= existing.offset && errorEnd <= existingEnd) {
          isOverlapping = true;
          console.log('[Voltaire] Error contained in existing error, ignoring:', errorKey);
          break;
        } else if (existing.offset >= offset && existingEnd <= errorEnd) {
          // Remplacer l'erreur existante par la plus grande
          const index = deduplicatedCorrections.indexOf(existing);
          deduplicatedCorrections[index] = correction;
          seenOffsets.delete(`${existing.offset}-${existing.length}`);
          seenOffsets.add(errorKey);
          isOverlapping = true;
          console.log('[Voltaire] Replaced smaller error with larger one:', errorKey);
          break;
        } else {
          // Chevauchement partiel : garder la première (ou celle avec la plus grande longueur)
          if (length > existing.length) {
            const index = deduplicatedCorrections.indexOf(existing);
            deduplicatedCorrections[index] = correction;
            seenOffsets.delete(`${existing.offset}-${existing.length}`);
            seenOffsets.add(errorKey);
            console.log('[Voltaire] Replaced error with longer overlapping one:', errorKey);
          }
          isOverlapping = true;
          break;
        }
      }
    }
    
    if (!isOverlapping) {
      deduplicatedCorrections.push(correction);
      seenOffsets.add(errorKey);
    }
  });
  
  console.log('[Voltaire] Deduplicated corrections:', deduplicatedCorrections.length, 'from', corrections.length);
  
  // Trier par offset décroissant pour traiter de droite à gauche
  deduplicatedCorrections.sort((a, b) => b.offset - a.offset);

  deduplicatedCorrections.forEach(correction => {
    const { offset, length } = correction;
    const errorText = textData.text.substring(offset, offset + length).trim();
    console.log('[Voltaire] Processing error at offset:', offset, 'with length:', length, 'error text:', errorText);

    // Méthode 1: Essayer de trouver le div par le texte de l'erreur (plus fiable)
    let targetDiv = findDivByErrorText(errorText, textData);
    
    // Méthode 2: Si on ne trouve pas par le texte, utiliser l'offset
    if (!targetDiv) {
      targetDiv = findDivForOffset(container, offset, textData, length);
    }
    
    // Méthode 3: Si toujours pas trouvé et qu'on a un seul conteneur, utiliser le conteneur
    if (!targetDiv && textData.wordDivs.length === 0 && container) {
      // Le texte est directement dans le conteneur, pas de divs individuels
      // On va insérer le point dans le conteneur au bon endroit
      const errorStartInText = textData.text.indexOf(errorText, offset - 10);
      if (errorStartInText !== -1) {
        // Créer un Range pour insérer le point au bon endroit
        try {
          const range = document.createRange();
          const textNode = container.firstChild;
          if (textNode && textNode.nodeType === Node.TEXT_NODE) {
            const textContent = textNode.textContent;
            const errorPos = textContent.indexOf(errorText);
            if (errorPos !== -1) {
              range.setStart(textNode, errorPos);
              range.setEnd(textNode, errorPos);
              const dotSpan = document.createElement('span');
              dotSpan.textContent = '.';
              dotSpan.style.color = 'black';
              dotSpan.setAttribute('data-voltaire', '1');
              dotSpan.setAttribute('data-voltaire-dot', '1');
              range.insertNode(dotSpan);
              console.log('[Voltaire] Dot inserted using Range at position:', errorPos);
              return;
            }
          }
        } catch (e) {
          console.warn('[Voltaire] Failed to insert using Range:', e);
        }
      }
      // Fallback: utiliser le conteneur directement
      targetDiv = container;
    }
    
    if (targetDiv) {
      // Vérifier si ce div a déjà été traité pour éviter les doublons
      if (processedDivs.has(targetDiv)) {
        console.log('[Voltaire] Div already processed, skipping:', targetDiv.textContent.trim().substring(0, 30));
        return;
      }
      
      const wordText = targetDiv.textContent.trim();
      console.log('[Voltaire] Found div for error, word:', wordText.substring(0, 30), 'error text was:', errorText);
      
      // Vérifier que le div trouvé correspond bien à l'erreur
      // (pour éviter les faux positifs)
      const wordTextLower = wordText.toLowerCase();
      const errorTextLower = errorText.toLowerCase();
      
      if (wordTextLower === errorTextLower || 
          wordTextLower.includes(errorTextLower) || 
          errorTextLower.includes(wordTextLower) ||
          wordTextLower.split(/\s+/).some(w => w === errorTextLower)) {
        insertDotBeforeDiv(targetDiv);
        processedDivs.add(targetDiv); // Marquer comme traité
      } else {
        console.warn('[Voltaire] Div found but text does not match exactly:', wordText.substring(0, 30), 'vs', errorText);
        // Essayer quand même si c'est le seul div proche de l'offset
        insertDotBeforeDiv(targetDiv);
        processedDivs.add(targetDiv); // Marquer comme traité
      }
    } else {
      console.error('[Voltaire] Error: Could not find div for offset:', offset, 'length:', length, 'error text:', errorText);
      console.log('[Voltaire] Available word divs:', textData.wordDivs.map(w => ({
        start: w.startOffset,
        end: w.endOffset,
        text: w.div.textContent.trim().substring(0, 20)
      })));
      // Dernier recours: essayer d'insérer dans le conteneur
      if (container && !processedDivs.has(container)) {
        console.log('[Voltaire] Trying to insert dot in container as fallback');
        insertDotBeforeDiv(container);
        processedDivs.add(container);
      }
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
  
  // Ignorer les textes trop courts (probablement pas des phrases complètes)
  // Augmenter le minimum à 30 caractères pour éviter les consignes courtes
  if (trimmedText.length < 30) {
    return;
  }
  
  // Exiger une ponctuation de fin pour être sûr que c'est une phrase complète
  if (!/[.!?]$/.test(trimmedText)) {
    // Accepter seulement si c'est très long (plus de 100 caractères) et a beaucoup de mots
    const words = trimmedText.split(/\s+/);
    if (trimmedText.length < 100 || words.length < 8) {
      console.log('[Voltaire] Skipping text without end punctuation:', trimmedText.substring(0, 50));
      return;
    }
  }
  
  // Ignorer les consignes/instructions
  if (isInstructionText(trimmedText)) {
    console.log('[Voltaire] Skipping instruction text:', trimmedText.substring(0, 50));
    return;
  }
  
  // Normaliser le texte : remplacer les espaces multiples et retours à la ligne par un seul espace
  // Cela évite les problèmes d'offsets avec Grammalecte
  const normalizedText = trimmedText.replace(/\s+/g, ' ').trim();
  
  // Créer un mapping entre le texte normalisé et le texte original
  // pour ajuster les offsets retournés par Grammalecte
  const offsetMapping = createOffsetMapping(trimmedText, normalizedText);
  
  // Calculer le décalage (nombre d'espaces au début)
  const leadingSpaces = originalText.length - originalText.trimStart().length;
  
  console.log('[Voltaire] Analyzing text (full):', trimmedText);
  console.log('[Voltaire] Normalized text:', normalizedText);
  console.log('[Voltaire] Original text length:', originalText.length);
  console.log('[Voltaire] Trimmed text length:', trimmedText.length);
  console.log('[Voltaire] Normalized text length:', normalizedText.length);
  console.log('[Voltaire] Leading spaces:', leadingSpaces);
  console.log('[Voltaire] Text divs found:', textData.textDivs.length);
  console.log('[Voltaire] Words:', textData.wordDivs.length > 0 ? textData.wordDivs.map(w => w.div.textContent.trim()).slice(0, 10) : 'No word divs');
  
  // Vérifier que le runtime est toujours valide avant d'envoyer le message
  if (!chrome.runtime || !chrome.runtime.id) {
    console.warn('[Voltaire] Extension context invalidated, skipping analysis');
    return;
  }
  
  // Appeler l'API Grammalecte via le service worker pour éviter les problèmes CORS
  try {
    chrome.runtime.sendMessage({
      action: 'checkText',
      text: normalizedText,
      language: 'fr'
    }, (response) => {
      // Gérer les erreurs silencieusement
      if (chrome.runtime.lastError) {
        // Gérer spécifiquement l'erreur "Extension context invalidated"
        if (chrome.runtime.lastError.message.includes('Extension context invalidated') ||
            chrome.runtime.lastError.message.includes('context invalidated')) {
          console.warn('[Voltaire] Extension context invalidated, skipping response');
          return;
        }
        // Ne logger que si ce n'est pas une erreur de port fermé (normale)
        if (!chrome.runtime.lastError.message.includes('port') && 
            !chrome.runtime.lastError.message.includes('closed')) {
          console.error('[Voltaire] Service worker error:', chrome.runtime.lastError.message);
        }
        // Marquer comme analysé même en cas d'erreur pour éviter les boucles
        analyzedPhrases.add(container);
        container.setAttribute('data-voltaire-analyzed', '1');
        return;
      }
    
    // Vérifier si la réponse contient une erreur
    if (response && response.error) {
      console.error('[Voltaire] Grammalecte API error:', response.error);
      // Marquer comme analysé même en cas d'erreur
      analyzedPhrases.add(container);
      container.setAttribute('data-voltaire-analyzed', '1');
      return;
    }
    
    // Vérifier si la réponse est valide
    if (!response) {
      console.error('[Voltaire] No response from Grammalecte API');
      analyzedPhrases.add(container);
      container.setAttribute('data-voltaire-analyzed', '1');
      return;
    }
    
    if (response && response.matches && Array.isArray(response.matches) && response.matches.length > 0) {
      console.log('[Voltaire] Grammalecte API Response received, matches:', response.matches.length);
      console.log('[Voltaire] Matches details:', response.matches.map(m => ({
        offset: m.offset,
        length: m.length,
        text: normalizedText.substring(m.offset, m.offset + m.length),
        message: m.message
      })));
      // Ajuster les offsets du texte normalisé vers le texte original
      const adjustedMatches = response.matches.map(match => {
        // Convertir l'offset du texte normalisé vers le texte trimmed
        const originalOffset = offsetMapping.normalizedToOriginal(match.offset);
        const originalEndOffset = offsetMapping.normalizedToOriginal(match.offset + match.length);
        
        return {
          offset: originalOffset + leadingSpaces,
          length: originalEndOffset - originalOffset,
          message: match.message,
          replacements: match.replacements,
          context: match.context
        };
      });
      console.log('[Voltaire] Adjusted matches:', adjustedMatches.map(m => ({
        offset: m.offset,
        length: m.length,
        text: originalText.substring(m.offset, m.offset + m.length)
      })));
      displayCorrection(container, textData, adjustedMatches);
    } else {
      console.log('[Voltaire] No errors found in text:', trimmedText.substring(0, 50));
    }
    
    // Marquer comme analysé
    analyzedPhrases.add(container);
    container.setAttribute('data-voltaire-analyzed', '1');
    });
  } catch (error) {
    // Gérer les erreurs de runtime invalide
    if (error.message && error.message.includes('Extension context invalidated')) {
      console.warn('[Voltaire] Extension context invalidated, skipping analysis');
      return;
    }
    console.error('[Voltaire] Error sending message:', error);
    analyzedPhrases.add(container);
    container.setAttribute('data-voltaire-analyzed', '1');
  }
}

// Débouncer pour éviter trop d'appels API
const debouncedCheckAndDisplayCorrections = debounce(checkAndDisplayCorrections, 500);

// Analyse tous les conteneurs de phrases dans #root
function analyzeAllSentences() {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.log('[Voltaire] Root element not found, trying body element...');
    // Fallback: utiliser body si #root n'existe pas
    const bodyElement = document.body;
    if (bodyElement) {
      const containers = findSentenceContainers(bodyElement);
      console.log('[Voltaire] Found', containers.length, 'sentence containers in body');
      containers.forEach(container => {
        debouncedCheckAndDisplayCorrections(container);
      });
    }
    return;
  }
  
  const containers = findSentenceContainers(rootElement);
  console.log('[Voltaire] Found', containers.length, 'sentence containers in #root');
  
  containers.forEach(container => {
    debouncedCheckAndDisplayCorrections(container);
  });
}

// Initialise le MutationObserver pour surveiller #root ou body
function initMutationObserver() {
  const rootElement = document.getElementById('root');
  const targetElement = rootElement || document.body;
  
  if (!targetElement) {
    // Attendre que le DOM soit disponible
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
        
        // Si un nouveau nœud est ajouté, analyser
        if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
          // Vérifier si c'est dans l'élément cible ou un descendant
          let parent = node.parentNode;
          while (parent) {
            if (parent === targetElement || parent.id === 'root') {
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

  // Observer l'élément cible et tous ses descendants
  observer.observe(targetElement, { 
    childList: true, 
    subtree: true,
    characterData: true
  });
  
  console.log('[Voltaire] MutationObserver initialized for', rootElement ? '#root' : 'body');
  
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
