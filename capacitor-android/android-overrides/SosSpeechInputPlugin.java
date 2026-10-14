package br.com.thiaguinho.cliente;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.speech.RecognizerIntent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;

/** Ponte para o reconhecedor de voz instalado no Android. Sem salvamento de O.S. */
@CapacitorPlugin(name = "SosSpeechInput")
public class SosSpeechInputPlugin extends Plugin {
    @PluginMethod
    public void listen(PluginCall call) {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR");
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "pt-BR");
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Dite o texto para o campo selecionado");
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        try {
            startActivityForResult(call, intent, "speechResult");
        } catch (ActivityNotFoundException e) {
            call.reject("Reconhecimento de voz não está disponível neste Android.", "UNAVAILABLE", e);
        } catch (Exception e) {
            call.reject("Não foi possível iniciar a entrada de voz.", "START_FAILED", e);
        }
    }

    @ActivityCallback
    private void speechResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Ditado cancelado.", "CANCELLED");
            return;
        }
        ArrayList<String> matches = result.getData().getStringArrayListExtra(
                RecognizerIntent.EXTRA_RESULTS);
        if (matches == null || matches.isEmpty() || matches.get(0) == null ||
                matches.get(0).trim().isEmpty()) {
            call.reject("Nenhuma fala reconhecida.", "EMPTY_RESULT");
            return;
        }
        JSObject response = new JSObject();
        response.put("text", matches.get(0).trim());
        call.resolve(response);
    }
}
