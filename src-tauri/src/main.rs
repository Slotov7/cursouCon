fn main() {
    if let Err(error) = cursoucon_lib::run() {
        eprintln!("Falha ao iniciar o CursouCon: {error}");
    }
}
